import { randomBytes } from 'node:crypto';
import { onCall } from 'firebase-functions/https';
import { COL, FieldValue, adminAuth, db } from '../lib/admin';
import { conflict, denied, invalid, notFound } from '../lib/errors';
import { z } from 'zod';
import { requireAdmin, requireStaff } from '../lib/guards';
import { assertVendorAccess } from './vendors';
import { ensureVendorLogin } from './activation';
import { buildSearchKeywords } from '../lib/search';
import { parse, schemas } from '../lib/validation';

/**
 * Team management (Admin only): RCPL staff logins for the Category team,
 * Billing team and other Admins. Roles are custom claims set here; category
 * assignments live on the user profile (read fresh by rules/functions).
 * New users receive a "set your password" email (sent by the web app via
 * Firebase Auth) — no shared or default passwords.
 */
export const createStaffUser = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const input = parse(schemas.staffCreate, req.data);
  const categories = input.role === 'CATEGORY' ? [...new Set(input.categories)].sort() : [];

  const vendorClash = await db.collection(COL.vendors).where('email', '==', input.email).limit(1).get();
  if (!vendorClash.empty) throw conflict('This email belongs to a vendor. Use a different email for staff access.');

  let uid: string;
  try {
    const user = await adminAuth.createUser({
      email: input.email,
      displayName: input.fullName,
      // random throwaway password — the user sets their own via the reset email
      password: randomBytes(24).toString('base64url') + 'aA1!',
    });
    uid = user.uid;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-exists') throw conflict('A login already exists for this email.');
    throw err;
  }
  try {
    await adminAuth.setCustomUserClaims(uid, { role: input.role });
    await db.collection(COL.userProfiles).doc(uid).create({
      role: input.role,
      vendorId: null,
      fullName: input.fullName,
      email: input.email,
      categories,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: admin.uid,
      searchKeywords: buildSearchKeywords(input.fullName, input.email),
    });
  } catch (err) {
    await adminAuth.deleteUser(uid).catch(() => undefined);
    throw err;
  }
  return { uid };
});

export const updateStaffUser = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const input = parse(schemas.staffUpdate, req.data);
  const ref = db.collection(COL.userProfiles).doc(input.uid);
  const snap = await ref.get();
  if (!snap.exists || snap.get('role') === 'VENDOR') throw notFound('Staff user not found.');
  if (input.uid === admin.uid && input.role !== 'ADMIN') throw invalid('You cannot remove your own admin role.');
  const roleChanged = snap.get('role') !== input.role;
  await ref.update({
    role: input.role,
    fullName: input.fullName,
    categories: input.role === 'CATEGORY' ? [...new Set(input.categories)].sort() : [],
    searchKeywords: buildSearchKeywords(input.fullName, snap.get('email')),
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (roleChanged) {
    await adminAuth.setCustomUserClaims(input.uid, { role: input.role });
    await adminAuth.revokeRefreshTokens(input.uid); // force a fresh token with the new role
  }
  await adminAuth.updateUser(input.uid, { displayName: input.fullName }).catch(() => undefined);
  return { uid: input.uid };
});

/** Deactivate / reactivate a staff login (access ends immediately). */
export const setStaffActive = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const { uid, active } = parse(schemas.staffActive, req.data);
  if (uid === admin.uid) throw denied('You cannot deactivate your own account.');
  const ref = db.collection(COL.userProfiles).doc(uid);
  const snap = await ref.get();
  if (!snap.exists || snap.get('role') === 'VENDOR') throw notFound('Staff user not found.');
  await ref.update({ active, updatedAt: FieldValue.serverTimestamp() });
  await adminAuth.updateUser(uid, { disabled: !active });
  if (!active) await adminAuth.revokeRefreshTokens(uid);
  return { uid, active };
});

/**
 * One-time "set your password" link for a user, so Admin can share it directly
 * (Teams / WhatsApp) when the Firebase email is blocked by a company mail
 * gateway. Same link as in the email; it expires and works only once.
 *   kind STAFF  → Admin only
 *   kind VENDOR → Admin, or the category team of the vendor's categories
 */
export const generateSetupLink = onCall(async (req) => {
  const { kind, id } = parse(z.object({ kind: z.enum(['STAFF', 'VENDOR']), id: z.string().min(6).max(128) }), req.data);
  const appUrl = (process.env.APP_URL || `https://${process.env.GCLOUD_PROJECT}.web.app`).replace(/\/$/, '');
  let email: string;
  let next: string;
  if (kind === 'STAFF') {
    await requireAdmin(req);
    const p = await db.collection(COL.userProfiles).doc(id).get();
    if (!p.exists || p.get('role') === 'VENDOR') throw notFound('Staff user not found.');
    if (p.get('active') === false) throw conflict('This user is deactivated.');
    email = p.get('email');
    next = '/admin/login';
  } else {
    const staff = await requireStaff(req, ['ADMIN', 'CATEGORY']);
    const v = await db.collection(COL.vendors).doc(id).get();
    if (!v.exists) throw notFound('Vendor not found.');
    assertVendorAccess(staff, v.get('categories') ?? []);
    if (v.get('accountStatus') === 'DEACTIVATED') throw conflict('This vendor is deactivated.');
    ({ email } = await ensureVendorLogin(id));
    next = '/login';
  }
  const link = await adminAuth.generatePasswordResetLink(email, { url: `${appUrl}${next}` });
  return { link, email };
});
