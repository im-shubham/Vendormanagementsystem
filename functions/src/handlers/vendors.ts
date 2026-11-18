import { onCall } from 'firebase-functions/https';
import { logger } from 'firebase-functions';
import { COL, FieldValue, adminAuth, db } from '../lib/admin';
import { alreadyExists, conflict, invalid, notFound } from '../lib/errors';
import { requireAdmin } from '../lib/guards';
import { uniqueKey } from '../lib/keys';
import { notifyVendor } from '../lib/notifications';
import { buildSearchKeywords } from '../lib/search';
import { docId, parse, schemas } from '../lib/validation';
import { z } from 'zod';

const keywords = (v: { vendorName: string; vendorCode: string; email: string; contactPerson?: string }) =>
  buildSearchKeywords(v.vendorName, v.vendorCode, v.email, v.contactPerson);

/** Admin: create a vendor master record (status NOT_REGISTERED). */
export const createVendor = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const input = parse(schemas.vendor, req.data);
  const ref = db.collection(COL.vendors).doc();
  await db.runTransaction(async (tx) => {
    const codeKey = uniqueKey.vendorCode(input.vendorCode);
    const emailKey = uniqueKey.vendorEmail(input.email);
    const [c, e] = await Promise.all([tx.get(codeKey), tx.get(emailKey)]);
    if (c.exists) throw alreadyExists(`Vendor code ${input.vendorCode} is already in use.`);
    if (e.exists) throw alreadyExists(`Email ${input.email} is already registered to another vendor.`);
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
      createdBy: admin.uid,
      searchKeywords: keywords(input),
    });
  });
  return { vendorId: ref.id };
});

/** Admin: edit vendor details. Email is locked once the vendor has a login. */
export const updateVendor = onCall(async (req) => {
  await requireAdmin(req);
  const { vendorId, ...input } = parse(schemas.vendor.extend({ vendorId: docId }), req.data);
  const ref = db.collection(COL.vendors).doc(vendorId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Vendor not found.');
    const cur = snap.data()!;
    if (cur.authUid && cur.email !== input.email) {
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
    tx.update(ref, { ...input, searchKeywords: keywords(input), updatedAt: FieldValue.serverTimestamp() });
    if (cur.authUid) tx.update(db.collection(COL.userProfiles).doc(cur.authUid), { fullName: input.vendorName });
  });
  return { vendorId };
});

/**
 * Admin: deactivate (soft delete). Historical PODs are preserved. The login
 * is disabled and its refresh tokens revoked, so access ends immediately.
 */
export const deactivateVendor = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const { vendorId } = parse(z.object({ vendorId: docId }), req.data);
  const ref = db.collection(COL.vendors).doc(vendorId);
  const authUid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Vendor not found.');
    if (snap.get('accountStatus') === 'DEACTIVATED') throw conflict('Vendor is already deactivated.');
    const pending = await tx.get(db.collection(COL.registrations).where('vendorId', '==', vendorId).where('approvalStatus', '==', 'PENDING'));
    const now = FieldValue.serverTimestamp();
    for (const r of pending.docs) {
      tx.update(r.ref, { approvalStatus: 'REJECTED', reviewedAt: now, reviewedBy: admin.uid, reviewedByName: admin.name, remarks: 'Vendor deactivated' });
    }
    tx.update(ref, { accountStatus: 'DEACTIVATED', updatedAt: now });
    return snap.get('authUid') as string | null;
  });
  if (authUid) {
    await adminAuth.updateUser(authUid, { disabled: true });
    await adminAuth.revokeRefreshTokens(authUid);
  }
  return { vendorId, accountStatus: 'DEACTIVATED' };
});

/** Admin: reactivate a DEACTIVATED or REJECTED vendor. */
export const reactivateVendor = onCall(async (req) => {
  await requireAdmin(req);
  const { vendorId } = parse(z.object({ vendorId: docId }), req.data);
  const ref = db.collection(COL.vendors).doc(vendorId);
  const { authUid, next } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('Vendor not found.');
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
