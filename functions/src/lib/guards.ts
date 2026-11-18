import type { CallableRequest } from 'firebase-functions/https';
import { COL, db } from './admin';
import type { Category, Role, StaffRole } from './constants';
import { ACCOUNT_MESSAGES, denied, fail } from './errors';

/**
 * Roles come ONLY from the server-set custom claim `role`. For staff
 * (ADMIN / CATEGORY / BILLING) the user profile must also be active; category
 * assignments are read fresh from the profile on every call.
 */
export interface StaffCaller {
  uid: string;
  role: StaffRole;
  name: string;
  categories: Category[];
}

export async function requireStaff(req: CallableRequest, allowed: StaffRole[]): Promise<StaffCaller> {
  if (!req.auth) throw fail('unauthenticated', 'Please log in.', 'UNAUTHENTICATED');
  const role = req.auth.token.role as Role | undefined;
  if (!role || role === 'VENDOR' || !allowed.includes(role)) throw denied();
  const profile = await db.collection(COL.userProfiles).doc(req.auth.uid).get();
  if (!profile.exists || profile.get('role') !== role || profile.get('active') === false) {
    throw denied('Your staff account is inactive. Please contact the administrator.', 'ACCOUNT_DEACTIVATED');
  }
  return {
    uid: req.auth.uid,
    role,
    name: profile.get('fullName') ?? req.auth.token.email ?? 'RCPL',
    categories: (profile.get('categories') as Category[] | undefined) ?? [],
  };
}

export const requireAdmin = (req: CallableRequest) => requireStaff(req, ['ADMIN']);

export interface VendorCaller {
  uid: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  categories: Category[];
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
  return {
    uid: req.auth.uid,
    vendorId,
    vendorName: vendor.get('vendorName'),
    vendorCode: vendor.get('vendorCode'),
    categories: (vendor.get('categories') as Category[] | undefined) ?? [],
  };
}

/** Either an active vendor or staff in one of the allowed roles. */
export type Caller = ({ kind: 'VENDOR' } & VendorCaller) | ({ kind: 'STAFF' } & StaffCaller);

export async function requireCaller(req: CallableRequest, staffRoles: StaffRole[]): Promise<Caller> {
  if (req.auth?.token.role === 'VENDOR') return { kind: 'VENDOR', ...(await requireActiveVendor(req)) };
  return { kind: 'STAFF', ...(await requireStaff(req, staffRoles)) };
}
