import { onCall } from 'firebase-functions/https';
import { COL, FieldValue, db } from '../lib/admin';
import { conflict, notFound } from '../lib/errors';
import { requireStaff } from '../lib/guards';
import { assertVendorAccess } from './vendors';
import { notifyVendor } from '../lib/notifications';
import { parse, schemas } from '../lib/validation';

/** Admin, or the category team of the vendor's categories: approve / reject a first-time registration. */
export const reviewVendorRegistration = onCall(async (req) => {
  const admin = await requireStaff(req, ['ADMIN', 'CATEGORY']);
  const { requestId, decision, remarks } = parse(schemas.reviewRegistration, req.data);
  const reqRef = db.collection(COL.registrations).doc(requestId);

  const vendorId = await db.runTransaction(async (tx) => {
    const r = await tx.get(reqRef);
    if (!r.exists) throw notFound('Registration request not found.');
    if (r.get('approvalStatus') !== 'PENDING') throw conflict('This registration request has already been reviewed.');
    const vRef = db.collection(COL.vendors).doc(r.get('vendorId'));
    const v = await tx.get(vRef);
    assertVendorAccess(admin, v.get('categories') ?? []);
    if (v.get('accountStatus') !== 'PENDING_APPROVAL') throw conflict('The vendor account is no longer awaiting approval.');
    const now = FieldValue.serverTimestamp();
    tx.update(reqRef, { approvalStatus: decision, remarks, reviewedAt: now, reviewedBy: admin.uid, reviewedByName: admin.name });
    tx.update(vRef, { accountStatus: decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED', updatedAt: now });
    return vRef.id;
  });

  if (decision === 'APPROVED') {
    await notifyVendor(vendorId, { title: 'Account approved', message: 'Welcome to the RCPL Vendor POD Portal. Your account has been approved.', link: '/vendor' });
  }
  return { vendorId, accountStatus: decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED' };
});
