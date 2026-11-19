import { onCall } from 'firebase-functions/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { COL, FieldValue, adminAuth, db } from '../lib/admin';
import { CATEGORY_LABELS, type Category } from '../lib/constants';
import { alreadyExists, conflict, denied, invalid, notFound } from '../lib/errors';
import { requireStaff, type StaffCaller } from '../lib/guards';
import { uniqueKey } from '../lib/keys';
import { categoryText, notify, notifyVendor } from '../lib/notifications';
import { ensureVendorLogin } from './activation';
import { buildSearchKeywords } from '../lib/search';
import { categoriesSchema, docId, emailSchema, parse, schemas, vendorCodeSchema } from '../lib/validation';

/**
 * Vendor master. Admin: full access. Category team: vendors that supply any
 * of their categories — create, edit, add/remove THEIR categories,
 * deactivate/reactivate. Other teams' categories on a vendor are never touched
 * by a category user.
 */

const keywords = (v: { vendorName: string; vendorCode: string; email: string; contactPerson?: string }) =>
  buildSearchKeywords(v.vendorName, v.vendorCode, v.email, v.contactPerson);

const VENDOR_ROLES = ['ADMIN', 'CATEGORY'] as const;

/** Category users may only manage vendors that share at least one of their categories. */
function assertVendorAccess(staff: StaffCaller, vendorCategories: Category[]) {
  if (staff.role === 'ADMIN') return;
  if (!vendorCategories.some((c) => staff.categories.includes(c))) throw notFound('Vendor not found.');
}

/** Category users can only assign their own categories. */
function assertOwnCategories(staff: StaffCaller, categories: Category[]) {
  if (staff.role === 'ADMIN') return;
  const foreign = categories.filter((c) => !staff.categories.includes(c));
  if (foreign.length) {
    throw denied(`You can only assign your own categories. Not assigned to you: ${foreign.map((c) => CATEGORY_LABELS[c]).join(', ')}.`);
  }
}

/**
 * Merge a category user's edit into the vendor's categories: they can add or
 * remove their own categories; categories of other teams are kept.
 */
function mergeCategories(staff: StaffCaller, current: Category[], requested: Category[]): Category[] {
  if (staff.role === 'ADMIN') return [...new Set(requested)].sort();
  const others = current.filter((c) => !staff.categories.includes(c));
  const mine = requested.filter((c) => staff.categories.includes(c));
  return [...new Set([...others, ...mine])].sort() as Category[];
}

/** Keep the categories copied onto registration requests in sync (used by security rules). */
async function syncRegistrationCategories(vendorId: string, categories: Category[]) {
  const regs = await db.collection(COL.registrations).where('vendorId', '==', vendorId).get();
  if (regs.empty) return;
  const batch = db.batch();
  regs.docs.forEach((r) => batch.update(r.ref, { categories }));
  await batch.commit();
}

/** Create a vendor master record (status NOT_REGISTERED). */
export const createVendor = onCall(async (req) => {
  const staff = await requireStaff(req, [...VENDOR_ROLES]);
  const input = parse(schemas.vendor, req.data);
  assertOwnCategories(staff, input.categories);
  await assertEmailFreeForVendor(input.email);
  const ref = db.collection(COL.vendors).doc();
  await db.runTransaction(async (tx) => {
    const codeKey = uniqueKey.vendorCode(input.vendorCode);
    const emailKey = uniqueKey.vendorEmail(input.email);
    const [c, e] = await Promise.all([tx.get(codeKey), tx.get(emailKey)]);
    const hint = staff.role === 'CATEGORY' ? ' If this vendor also supplies your category, use "Add Existing Vendor".' : '';
    if (c.exists) throw alreadyExists(`Vendor code ${input.vendorCode} is already registered.${hint}`);
    if (e.exists) throw alreadyExists(`Email ${input.email} is already registered to a vendor.${hint}`);
    const now = FieldValue.serverTimestamp();
    tx.create(codeKey, { kind: 'vendorCode', vendorId: ref.id });
    tx.create(emailKey, { kind: 'vendorEmail', vendorId: ref.id });
    tx.create(ref, {
      ...input,
      accountStatus: 'NOT_REGISTERED',
      authUid: null,
      registeredAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: staff.uid,
      createdByName: staff.name,
      createdByRole: staff.role,
      searchKeywords: keywords(input),
    });
  });
  // Create the vendor's login now; the web app then sends the Firebase "set your password" email.
  await ensureVendorLogin(ref.id);
  await notify(
    { admins: true, categories: input.categories },
    { title: 'New vendor added', message: `${input.vendorName} (${input.vendorCode}, ${categoryText(input.categories)}) was added by ${staff.name}. A "set your password" email was sent to the vendor.`, link: `/admin/vendors/${ref.id}` },
    { exceptUid: staff.uid, email: false },
  );
  return { vendorId: ref.id, email: input.email };
});

/** A vendor email must not belong to an RCPL staff login. */
async function assertEmailFreeForVendor(email: string) {
  try {
    const u = await adminAuth.getUserByEmail(email);
    const p = await db.collection(COL.userProfiles).doc(u.uid).get();
    if (!p.exists || p.get('role') !== 'VENDOR') throw conflict('This email is already used by an RCPL staff login. Use a different vendor email.');
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') return;
    throw err;
  }
}

/**
 * Prepare a (re)send of the "set your password" email for a vendor who has
 * not activated yet: makes sure their login exists and returns the email.
 * The web app then sends the Firebase Auth email.
 */
export const sendVendorInvite = onCall(async (req) => {
  const staff = await requireStaff(req, [...VENDOR_ROLES]);
  const { vendorId } = parse(z.object({ vendorId: docId }), req.data);
  const snap = await db.collection(COL.vendors).doc(vendorId).get();
  if (!snap.exists) throw notFound('Vendor not found.');
  assertVendorAccess(staff, snap.get('categories') ?? []);
  if (snap.get('accountStatus') !== 'NOT_REGISTERED') throw conflict('This vendor has already activated their login.');
  const { email } = await ensureVendorLogin(vendorId);
  return { email };
});

/**
 * Category team: add their category to a vendor that already exists (created
 * by another team). Vendor code AND registered email must both match, so the
 * vendor master cannot be browsed by guessing.
 */
export const linkVendorCategories = onCall(async (req) => {
  const staff = await requireStaff(req, [...VENDOR_ROLES]);
  const input = parse(z.object({ vendorCode: vendorCodeSchema, email: emailSchema, categories: categoriesSchema }), req.data);
  assertOwnCategories(staff, input.categories);
  const match = await db.collection(COL.vendors).where('vendorCode', '==', input.vendorCode).where('email', '==', input.email).limit(1).get();
  if (match.empty) throw notFound('No vendor matches this vendor code and email.');
  const ref = match.docs[0].ref;
  const categories = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.get('categories') as Category[] | undefined) ?? [];
    const merged = [...new Set([...current, ...input.categories])].sort() as Category[];
    tx.update(ref, { categories: merged, updatedAt: FieldValue.serverTimestamp() });
    return merged;
  });
  await syncRegistrationCategories(ref.id, categories);
  await notify(
    { admins: true },
    { title: 'Vendor linked to category', message: `${match.docs[0].get('vendorName')} now also supplies ${categoryText(input.categories)} (added by ${staff.name}).`, link: `/admin/vendors/${ref.id}` },
    { exceptUid: staff.uid, email: false },
  );
  return { vendorId: ref.id, vendorName: match.docs[0].get('vendorName') as string, categories };
});

/** Edit vendor details. Email is locked once the vendor has a login. */
export const updateVendor = onCall(async (req) => {
  const staff = await requireStaff(req, [...VENDOR_ROLES]);
  const { vendorId, ...input } = parse(schemas.vendor.extend({ vendorId: docId }), req.data);
  const ref = db.collection(COL.vendors).doc(vendorId);
  // A staff login's email can never become a vendor email (the vendor's own login is fine).
  if (req.data?.email) await assertEmailFreeForVendor(String(req.data.email).trim().toLowerCase());
  const { nextCats: categories, authUid, emailChanged } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Vendor not found.');
    const cur = snap.data()!;
    const currentCats = (cur.categories as Category[] | undefined) ?? [];
    assertVendorAccess(staff, currentCats);
    const nextCats = mergeCategories(staff, currentCats, input.categories);
    if (!nextCats.length) {
      throw invalid('A vendor needs at least one category. Deactivate the vendor instead of removing every category.', { categories: 'Keep at least one category' });
    }
    if (cur.accountStatus !== 'NOT_REGISTERED' && cur.email !== input.email) {
      throw invalid('The registered email cannot be changed after the vendor has activated their login.', { email: 'Email is locked after activation' });
    }
    const codeChanged = cur.vendorCode !== input.vendorCode;
    const emailChanged = cur.email !== input.email;
    const newCode = uniqueKey.vendorCode(input.vendorCode);
    const newEmail = uniqueKey.vendorEmail(input.email);
    const [c, e] = await Promise.all([codeChanged ? tx.get(newCode) : null, emailChanged ? tx.get(newEmail) : null]);
    if (c?.exists) throw alreadyExists(`Vendor code ${input.vendorCode} is already in use.`);
    if (e?.exists) throw alreadyExists(`Email ${input.email} is already registered to another vendor.`);
    if (codeChanged) {
      tx.delete(uniqueKey.vendorCode(cur.vendorCode));
      tx.create(newCode, { kind: 'vendorCode', vendorId });
    }
    if (emailChanged) {
      tx.delete(uniqueKey.vendorEmail(cur.email));
      tx.create(newEmail, { kind: 'vendorEmail', vendorId });
    }
    tx.update(ref, { ...input, categories: nextCats, searchKeywords: keywords(input), updatedAt: FieldValue.serverTimestamp() });
    if (cur.authUid) tx.update(db.collection(COL.userProfiles).doc(cur.authUid), { fullName: input.vendorName, email: input.email });
    return { nextCats, authUid: cur.authUid as string | null, emailChanged };
  });
  await syncRegistrationCategories(vendorId, categories);
  if (authUid) {
    await adminAuth.updateUser(authUid, { email: input.email, displayName: input.vendorName }).catch((e) => logger.error('auth sync failed', e));
  }
  return { vendorId, categories, emailChanged };
});

/**
 * Deactivate (soft delete). Historical PODs are preserved. The login is
 * disabled and its refresh tokens revoked, so access ends immediately.
 */
export const deactivateVendor = onCall(async (req) => {
  const staff = await requireStaff(req, [...VENDOR_ROLES]);
  const { vendorId } = parse(z.object({ vendorId: docId }), req.data);
  const ref = db.collection(COL.vendors).doc(vendorId);
  const authUid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Vendor not found.');
    assertVendorAccess(staff, snap.get('categories') ?? []);
    if (snap.get('accountStatus') === 'DEACTIVATED') throw conflict('Vendor is already deactivated.');
    const pending = await tx.get(db.collection(COL.registrations).where('vendorId', '==', vendorId).where('approvalStatus', '==', 'PENDING'));
    const now = FieldValue.serverTimestamp();
    for (const r of pending.docs) {
      tx.update(r.ref, { approvalStatus: 'REJECTED', reviewedAt: now, reviewedBy: staff.uid, reviewedByName: staff.name, remarks: 'Vendor deactivated' });
    }
    tx.update(ref, { accountStatus: 'DEACTIVATED', updatedAt: now, deactivatedBy: staff.uid, deactivatedByName: staff.name });
    return snap.get('authUid') as string | null;
  });
  if (authUid) {
    await adminAuth.updateUser(authUid, { disabled: true });
    await adminAuth.revokeRefreshTokens(authUid);
  }
  return { vendorId, accountStatus: 'DEACTIVATED' };
});

/** Reactivate a DEACTIVATED or REJECTED vendor. */
export const reactivateVendor = onCall(async (req) => {
  const staff = await requireStaff(req, [...VENDOR_ROLES]);
  const { vendorId } = parse(z.object({ vendorId: docId }), req.data);
  const ref = db.collection(COL.vendors).doc(vendorId);
  const { authUid, next } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Vendor not found.');
    assertVendorAccess(staff, snap.get('categories') ?? []);
    if (!['DEACTIVATED', 'REJECTED'].includes(snap.get('accountStatus'))) throw conflict('Only deactivated or rejected vendors can be reactivated.');
    const uid = snap.get('authUid') as string | null;
    const status = uid ? 'ACTIVE' : 'NOT_REGISTERED';
    tx.update(ref, { accountStatus: status, updatedAt: FieldValue.serverTimestamp() });
    return { authUid: uid, next: status };
  });
  if (authUid) {
    await adminAuth.updateUser(authUid, { disabled: false }).catch((e) => logger.error('enable user failed', e));
    await notifyVendor(vendorId, { title: 'Account activated', message: 'Your vendor account is now active. You can upload POD documents.', link: '/vendor' });
  }
  return { vendorId, accountStatus: next };
});

/**
 * Staff: vendors the caller may upload PODs for.
 * Admin → all vendors; Category → vendors that supply any of their categories.
 * (Vendors need not have activated a login — category teams upload PODs
 * received on WhatsApp / email on their behalf.)
 */
export const listUploadVendors = onCall(async (req) => {
  const staff = await requireStaff(req, ['ADMIN', 'CATEGORY']);
  let q: FirebaseFirestore.Query = db.collection(COL.vendors);
  if (staff.role === 'CATEGORY') {
    if (!staff.categories.length) return { vendors: [] };
    q = q.where('categories', 'array-contains-any', staff.categories.slice(0, 30));
  }
  const snap = await q.limit(2000).get();
  const vendors = snap.docs
    .filter((d) => d.get('accountStatus') !== 'DEACTIVATED')
    .map((d) => ({
      id: d.id,
      vendorName: d.get('vendorName') as string,
      vendorCode: d.get('vendorCode') as string,
      categories: ((d.get('categories') as string[]) ?? []).filter((c) => staff.role === 'ADMIN' || staff.categories.includes(c as never)),
    }))
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  return { vendors };
});

export { assertVendorAccess };
