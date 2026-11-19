import { randomBytes } from 'node:crypto';
import { onCall } from 'firebase-functions/https';
import { logger } from 'firebase-functions';
import { COL, FieldValue, adminAuth, db } from '../lib/admin';
import { ACCOUNT_MESSAGES, conflict, denied, fail, invalid } from '../lib/errors';
import { buildSearchKeywords } from '../lib/search';
import { notify } from '../lib/notifications';
import type { Category } from '../lib/constants';
import { parse, schemas } from '../lib/validation';

/**
 * Vendor onboarding
 * -----------------
 * 1. Admin / Category team adds the vendor → a Firebase Auth login is created
 *    right away (random throwaway password, claims {role: VENDOR, vendorId})
 *    and the web app asks Firebase Auth to email a "set your password" link.
 *    Status stays NOT_REGISTERED.
 * 2. Vendor sets a password (Firebase email link) and logs in → the app calls
 *    `completeVendorActivation` → registration request + PENDING_APPROVAL.
 *    (Alternative: the manual "First-Time Login" page with email + vendor
 *    code → `activateVendorAccount`.)
 * 3. Admin / Category team approves → ACTIVE.
 * Passwords are only ever stored by Firebase Auth, never in Firestore.
 */

const throwaway = () => randomBytes(24).toString('base64url') + 'aA1!';

/** Creates (or re-links) the vendor's Firebase Auth login. Returns the uid. */
export async function ensureVendorLogin(vendorId: string): Promise<{ uid: string; email: string }> {
  const ref = db.collection(COL.vendors).doc(vendorId);
  const snap = await ref.get();
  const v = snap.data()!;
  if (v.authUid) {
    try {
      await adminAuth.getUser(v.authUid);
      return { uid: v.authUid, email: v.email };
    } catch {
      /* login was deleted — recreate below */
    }
  }
  let uid: string;
  try {
    uid = (await adminAuth.createUser({ email: v.email, password: throwaway(), displayName: v.vendorName })).uid;
  } catch (err: any) {
    if (err?.code !== 'auth/email-already-exists') throw err;
    // An Auth user with this email exists: re-use it only if it is not a staff login.
    const existing = await adminAuth.getUserByEmail(v.email);
    const profile = await db.collection(COL.userProfiles).doc(existing.uid).get();
    if (profile.exists && profile.get('role') !== 'VENDOR') throw conflict('This email is already used by an RCPL staff login. Use a different vendor email.');
    if (profile.exists && profile.get('vendorId') !== vendorId) throw conflict('This email is already linked to another vendor.');
    uid = existing.uid;
  }
  await adminAuth.setCustomUserClaims(uid, { role: 'VENDOR', vendorId });
  await db.collection(COL.userProfiles).doc(uid).set(
    { role: 'VENDOR', vendorId, fullName: v.vendorName, email: v.email, createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await ref.update({ authUid: uid, updatedAt: FieldValue.serverTimestamp() });
  return { uid, email: v.email };
}

/** NOT_REGISTERED → PENDING_APPROVAL + registration request (inside a transaction). Returns false if already started. */
async function startRegistration(vendorId: string): Promise<{ started: boolean; vendor: FirebaseFirestore.DocumentData }> {
  const ref = db.collection(COL.vendors).doc(vendorId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const v = snap.data()!;
    if (v.accountStatus !== 'NOT_REGISTERED') return { started: false, vendor: v };
    const now = FieldValue.serverTimestamp();
    tx.create(db.collection(COL.registrations).doc(), {
      vendorId,
      vendorName: v.vendorName,
      vendorCode: v.vendorCode,
      email: v.email,
      contactPerson: v.contactPerson ?? null,
      mobileNumber: v.mobileNumber ?? null,
      categories: (v.categories as Category[] | undefined) ?? [],
      approvalStatus: 'PENDING',
      requestedAt: now,
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      remarks: null,
      searchKeywords: buildSearchKeywords(v.vendorName, v.vendorCode, v.email),
    });
    tx.update(ref, { accountStatus: 'PENDING_APPROVAL', registeredAt: now, updatedAt: now });
    return { started: true, vendor: v };
  });
  if (result.started) {
    const v = result.vendor;
    // Approval request: admins + category teams of the vendor's categories (in-app + email)
    await notify(
      { admins: true, categories: (v.categories as Category[] | undefined) ?? [] },
      {
        title: 'Vendor approval request',
        message: `${v.vendorName} (${v.vendorCode}) has activated their account and is awaiting approval.`,
        link: '/admin/registrations',
      },
    );
  }
  return result;
}

function statusError(status: string) {
  if (status === 'PENDING_APPROVAL') return conflict('This account has already been activated and is awaiting administrator approval.', 'ALREADY_ACTIVATED');
  if (status === 'ACTIVE') return conflict('This account is already active. Please log in or use "Forgot Password".', 'ALREADY_ACTIVATED');
  const m = ACCOUNT_MESSAGES[status as keyof typeof ACCOUNT_MESSAGES];
  return denied(m.message, m.code);
}

/**
 * Manual "First-Time Login" (unauthenticated): registered email + vendor code
 * + new password. Both must match an existing NOT_REGISTERED vendor.
 */
export const activateVendorAccount = onCall(async (req) => {
  const { email, vendorCode, password } = parse(schemas.activate, req.data);

  const match = await db.collection(COL.vendors).where('email', '==', email).where('vendorCode', '==', vendorCode).limit(1).get();
  if (match.empty) {
    throw invalid('No vendor record matches this email and vendor code. Please check the details or contact the RCPL vendor administration team.');
  }
  const vendorId = match.docs[0].id;
  const status = match.docs[0].get('accountStatus') as string;
  if (status !== 'NOT_REGISTERED') throw statusError(status);

  const { uid } = await ensureVendorLogin(vendorId);
  try {
    await adminAuth.updateUser(uid, { password });
  } catch (err: any) {
    if (err?.code === 'auth/invalid-password' || err?.code === 'auth/password-does-not-meet-requirements') throw invalid(err.message);
    throw err;
  }
  const r = await startRegistration(vendorId);
  if (!r.started) throw statusError(r.vendor.accountStatus);
  return { status: 'PENDING_APPROVAL', message: ACCOUNT_MESSAGES.PENDING_APPROVAL.message };
});

/**
 * Called by the web app when a NOT_REGISTERED vendor logs in for the first
 * time (after setting a password from the Firebase email link).
 */
export const completeVendorActivation = onCall(async (req) => {
  if (!req.auth) throw fail('unauthenticated', 'Please log in.', 'UNAUTHENTICATED');
  const { role, vendorId } = req.auth.token as { role?: string; vendorId?: string };
  if (role !== 'VENDOR' || !vendorId) throw denied('Vendor access required.');
  const snap = await db.collection(COL.vendors).doc(vendorId).get();
  if (!snap.exists || snap.get('authUid') !== req.auth.uid) throw denied('Vendor access required.');
  try {
    const r = await startRegistration(vendorId);
    return { status: r.started ? 'PENDING_APPROVAL' : (r.vendor.accountStatus as string) };
  } catch (err) {
    logger.error('completeVendorActivation failed', err);
    throw err;
  }
});
