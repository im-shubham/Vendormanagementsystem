import type { NextFunction, Request, Response } from 'express';
import { authProvider } from '../auth/index.js';
import { loadAuthContext } from '../services/profile.service.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import type { VendorAccountStatus } from '../types/auth.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return next(unauthorized());
  const authUserId = await authProvider.verifyAccessToken(token);
  if (!authUserId) return next(unauthorized('Your session has expired. Please log in again.'));
  const ctx = await loadAuthContext(authUserId);
  if (!ctx) return next(forbidden('No portal profile is linked to this login.'));
  req.auth = ctx;
  req.accessToken = token;
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== 'ADMIN') return next(forbidden('Administrator access required'));
  next();
}

export const ACCOUNT_STATUS_MESSAGES: Record<Exclude<VendorAccountStatus, 'ACTIVE'>, { code: string; message: string }> = {
  PENDING_APPROVAL: { code: 'ACCOUNT_PENDING', message: 'Your account is awaiting administrator approval.' },
  REJECTED: {
    code: 'ACCOUNT_REJECTED',
    message: 'Your registration request was not approved. Please contact the RCPL vendor administration team.',
  },
  DEACTIVATED: {
    code: 'ACCOUNT_DEACTIVATED',
    message: 'Your vendor account has been deactivated. Please contact the RCPL vendor administration team.',
  },
  NOT_REGISTERED: { code: 'ACCOUNT_NOT_REGISTERED', message: 'Please complete first-time account activation.' },
};

/** Vendor role AND account approved (ACTIVE). Checked on every request. */
export function requireActiveVendor(req: Request, _res: Response, next: NextFunction) {
  const a = req.auth;
  if (a?.role !== 'VENDOR') return next(forbidden('Vendor access required'));
  if (a.vendorStatus !== 'ACTIVE') {
    const s = ACCOUNT_STATUS_MESSAGES[(a.vendorStatus ?? 'NOT_REGISTERED') as keyof typeof ACCOUNT_STATUS_MESSAGES];
    return next(forbidden(s.message, s.code));
  }
  next();
}
