import type { CallableRequest } from 'firebase-functions/https';
import { COL, db } from './admin';
import { ACCOUNT_MESSAGES, denied, fail } from './errors';

export interface AdminCaller {
  uid: string;
  name: string;
}

/** Admin role comes ONLY from the server-set custom claim. */
export async function requireAdmin(req: CallableRequest): Promise<AdminCaller> {
  if (!req.auth) throw fail('unauthenticated', 'Please log in.', 'UNAUTHENTICATED');
  if (req.auth.token.role !== 'ADMIN') throw denied('Administrator access required.');
  const profile = await db.collection(COL.userProfiles).doc(req.auth.uid).get();
  if (profile.get('role') !== 'ADMIN') throw denied('Administrator access required.');
  return { uid: req.auth.uid, name: profile.get('fullName') ?? req.auth.token.email ?? 'RCPL Admin' };
}

export interface VendorCaller {
  uid: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
}

/** Vendor role (claim) + vendor record must be ACTIVE (checked fresh every call). */
export async function requireActiveVendor(req: CallableRequest): Promise<VendorCaller> {
  if (!req.auth) throw fail('unauthenticated', 'Please log in.', 'UNAUTHENTICATED');
  const { role, vendorId } = req.auth.token as { role?: string; vendorId?: string };
  if (role !== 'VENDOR' || !vendorId) throw denied('Vendor access required.');
  const vendor = await db.collection(COL.vendors).doc(vendorId).get();
  if (!vendor.exists || vendor.get('authUid') !== req.auth.uid) throw denied('Vendor access required.');
  const status = vendor.get('accountStatus') as keyof typeof ACCOUNT_MESSAGES | 'ACTIVE';
  if (status !== 'ACTIVE') {
    const m = ACCOUNT_MESSAGES[status];
    throw denied(m.message, m.code);
  }
  return { uid: req.auth.uid, vendorId, vendorName: vendor.get('vendorName'), vendorCode: vendor.get('vendorCode') };
}
