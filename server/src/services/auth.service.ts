import { authProvider, AuthProviderError } from '../auth/index.js';
import { env } from '../config/env.js';
import { pool, withSystem } from '../db/pool.js';
import { ACCOUNT_STATUS_MESSAGES } from '../middleware/auth.js';
import { HttpError, badRequest, conflict, forbidden, unauthorized } from '../utils/httpError.js';
import type { VendorAccountStatus } from '../types/auth.js';
import { loadAuthContext, publicUser } from './profile.service.js';
import { notify } from './notification.service.js';

const statusError = (status: VendorAccountStatus | null, details?: unknown) => {
  const s = ACCOUNT_STATUS_MESSAGES[(status ?? 'NOT_REGISTERED') as keyof typeof ACCOUNT_STATUS_MESSAGES];
  return new HttpError(403, s.message, s.code, details);
};

export async function login(identifier: string, password: string, portal: 'vendor' | 'admin') {
  let email = identifier.trim();
  if (!email.includes('@')) {
    if (portal === 'admin') throw unauthorized('Invalid email or password');
    // Vendors may log in with their vendor code as the User ID
    const { rows } = await pool.query('select email from public.vendors where upper(vendor_code) = upper($1)', [email]);
    if (!rows[0]) throw unauthorized('Invalid User ID / email or password');
    email = rows[0].email;
  }

  const session = await authProvider.signIn(email.toLowerCase(), password);
  if (!session) throw unauthorized(portal === 'admin' ? 'Invalid email or password' : 'Invalid User ID / email or password');

  const ctx = await loadAuthContext(session.userId);
  const reject = async (err: HttpError): Promise<never> => {
    await authProvider.signOut(session.accessToken);
    throw err;
  };
  if (!ctx) return reject(forbidden('No portal profile is linked to this login. Please contact the administrator.'));

  if (portal === 'admin' && ctx.role !== 'ADMIN') return reject(forbidden('This login is not authorised for the Admin Portal.', 'WRONG_PORTAL'));
  if (portal === 'vendor' && ctx.role !== 'VENDOR') return reject(forbidden('Administrators must sign in through the Admin Portal.', 'WRONG_PORTAL'));

  // Approval gate: no tokens are issued to vendors that are not ACTIVE.
  if (ctx.role === 'VENDOR' && ctx.vendorStatus !== 'ACTIVE') {
    return reject(statusError(ctx.vendorStatus, { vendorName: ctx.vendorName, vendorCode: ctx.vendorCode }));
  }

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
    user: publicUser(ctx),
  };
}

export async function refresh(refreshToken: string) {
  const session = await authProvider.refresh(refreshToken);
  if (!session) throw unauthorized('Your session has expired. Please log in again.');
  const ctx = await loadAuthContext(session.userId);
  if (!ctx) throw unauthorized();
  if (ctx.role === 'VENDOR' && ctx.vendorStatus !== 'ACTIVE') throw statusError(ctx.vendorStatus);
  return { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresIn: session.expiresIn, user: publicUser(ctx) };
}

/**
 * First-time vendor activation. The vendor must already exist in the vendor
 * master (created by an admin) with a matching email AND vendor code.
 * Result: auth user created, account PENDING_APPROVAL, request queued for admin.
 */
export async function activateVendor(email: string, vendorCode: string, password: string) {
  const { rows } = await pool.query(
    `select id, vendor_name, vendor_code, account_status from public.vendors
      where lower(email) = lower($1) and upper(vendor_code) = upper($2)`,
    [email, vendorCode],
  );
  const vendor = rows[0];
  if (!vendor) {
    throw badRequest(
      'No vendor record matches this email and vendor code. Please check the details or contact the RCPL vendor administration team.',
    );
  }
  switch (vendor.account_status as VendorAccountStatus) {
    case 'NOT_REGISTERED':
      break;
    case 'PENDING_APPROVAL':
      throw conflict('This account has already been activated and is awaiting administrator approval.');
    case 'ACTIVE':
      throw conflict('This account is already active. Please log in or use "Forgot Password".');
    default:
      throw statusError(vendor.account_status);
  }

  let authUserId: string;
  try {
    authUserId = await authProvider.createUser(email, password);
  } catch (err) {
    if (err instanceof AuthProviderError) {
      if (err.code === 'EMAIL_EXISTS') throw conflict('A login already exists for this email. Please log in or use "Forgot Password".');
      if (err.code === 'WEAK_PASSWORD') throw badRequest(err.message);
    }
    throw err;
  }

  try {
    await withSystem(async (db) => {
      // Lock the vendor row and re-check status to avoid double activation races
      const { rows: locked } = await db.query('select account_status from public.vendors where id = $1 for update', [vendor.id]);
      if (locked[0]?.account_status !== 'NOT_REGISTERED') throw conflict('This account has already been activated.');
      await db.query(
        `insert into public.user_profiles (auth_user_id, vendor_id, role, full_name, email)
         values ($1, $2, 'VENDOR', $3, lower($4))`,
        [authUserId, vendor.id, vendor.vendor_name, email],
      );
      await db.query(`insert into public.vendor_registration_requests (vendor_id) values ($1)`, [vendor.id]);
      await db.query(`update public.vendors set account_status = 'PENDING_APPROVAL', registered_at = now() where id = $1`, [vendor.id]);
    });
  } catch (err) {
    await authProvider.deleteUser(authUserId).catch((e) => console.error('Failed to roll back auth user', e));
    throw err;
  }

  await notify.admins({
    title: 'New vendor registration',
    message: `${vendor.vendor_name} (${vendor.vendor_code}) has activated their account and is awaiting approval.`,
    link: '/admin/registrations',
  });

  return { status: 'PENDING_APPROVAL', message: ACCOUNT_STATUS_MESSAGES.PENDING_APPROVAL.message };
}

export async function forgotPassword(email: string) {
  try {
    await authProvider.sendPasswordReset(email, `${env.APP_URL}/reset-password`);
  } catch (err) {
    console.error('Password reset request failed', err);
  }
  // Same response whether or not the account exists (no account enumeration)
  return { message: 'If an account exists for this email, a password reset link has been sent.' };
}

export async function resetPassword(token: string, password: string) {
  try {
    await authProvider.resetPassword(token, password);
  } catch (err) {
    if (err instanceof AuthProviderError) throw badRequest(err.message);
    throw err;
  }
  return { message: 'Your password has been updated. You can now log in.' };
}
