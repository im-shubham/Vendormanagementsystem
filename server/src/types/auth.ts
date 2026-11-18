export type UserRole = 'ADMIN' | 'VENDOR';
export type VendorAccountStatus = 'NOT_REGISTERED' | 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'DEACTIVATED';

export interface AuthContext {
  authUserId: string;
  profileId: string;
  role: UserRole;
  email: string;
  fullName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorCode: string | null;
  vendorStatus: VendorAccountStatus | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      accessToken?: string;
    }
  }
}
