import { pool } from '../db/pool.js';
import type { AuthContext } from '../types/auth.js';

/** Loads the caller's profile + vendor status (system read, keyed by verified auth id). */
export async function loadAuthContext(authUserId: string): Promise<AuthContext | null> {
  const { rows } = await pool.query(
    `select p.id as profile_id, p.role, p.email, p.full_name, p.vendor_id,
            v.vendor_name, v.vendor_code, v.account_status
       from public.user_profiles p
       left join public.vendors v on v.id = p.vendor_id
      where p.auth_user_id = $1`,
    [authUserId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    authUserId,
    profileId: r.profile_id,
    role: r.role,
    email: r.email,
    fullName: r.full_name,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    vendorCode: r.vendor_code,
    vendorStatus: r.account_status,
  };
}

export function publicUser(ctx: AuthContext) {
  return {
    id: ctx.profileId,
    role: ctx.role,
    email: ctx.email,
    fullName: ctx.role === 'VENDOR' ? ctx.vendorName : ctx.fullName,
    vendor:
      ctx.role === 'VENDOR'
        ? { id: ctx.vendorId, name: ctx.vendorName, code: ctx.vendorCode, status: ctx.vendorStatus }
        : null,
  };
}
