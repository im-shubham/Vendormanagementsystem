import { randomBytes } from 'node:crypto';
import { onCall } from 'firebase-functions/https';
import { COL, FieldValue, adminAuth, db } from '../lib/admin';
import { conflict, denied, invalid, notFound } from '../lib/errors';
import { requireAdmin } from '../lib/guards';
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
