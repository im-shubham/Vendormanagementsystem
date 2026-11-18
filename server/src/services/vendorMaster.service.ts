import { afterCommit, type Db } from '../db/pool.js';
import type { ListQuery } from '../utils/validation.js';
import { Where, escapeLike } from '../utils/sql.js';
import { sequential } from '../utils/sql.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { notify } from './notification.service.js';

/** All functions here run in an ADMIN user context (RLS enforced). */

export const mapVendor = (r: any) => ({
  id: r.id,
  vendorCode: r.vendor_code,
  vendorName: r.vendor_name,
  email: r.email,
  contactPerson: r.contact_person,
  mobileNumber: r.mobile_number,
  address: r.address,
  accountStatus: r.account_status,
  registeredAt: r.registered_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.submission_count !== undefined ? { submissionCount: r.submission_count } : {}),
});

const VENDOR_STATUSES = ['NOT_REGISTERED', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'DEACTIVATED'];

export async function listVendors(db: Db, q: ListQuery) {
  const w = new Where();
  if (q.search) {
    const p = `%${escapeLike(q.search.toLowerCase())}%`;
    w.add('(lower(v.vendor_name) like ? or lower(v.vendor_code) like ? or lower(v.email) like ?)', p, p, p);
  }
  if (q.status && VENDOR_STATUSES.includes(q.status)) w.add('v.account_status = ?::vendor_account_status', q.status);

  const { rows: countRows } = await db.query(`select count(*)::int as total from public.vendors v ${w}`, w.params);
  const limit = w.param(q.pageSize);
  const offset = w.param((q.page - 1) * q.pageSize);
  const { rows } = await db.query(
    `select v.*, (select count(*)::int from public.pod_submissions s where s.vendor_id = v.id) as submission_count
       from public.vendors v ${w}
      order by v.created_at desc
      limit ${limit} offset ${offset}`,
    w.params,
  );
  return { items: rows.map(mapVendor), total: countRows[0].total as number, page: q.page, pageSize: q.pageSize };
}

export interface VendorInput {
  vendorName: string;
  vendorCode: string;
  email: string;
  contactPerson: string;
  mobileNumber: string;
  address: string;
}

async function assertUnique(db: Db, input: VendorInput, excludeId?: string) {
  const { rows } = await db.query(
    `select upper(vendor_code) = upper($1) as code_taken, lower(email) = lower($2) as email_taken
       from public.vendors
      where (upper(vendor_code) = upper($1) or lower(email) = lower($2)) and ($3::uuid is null or id <> $3::uuid)`,
    [input.vendorCode, input.email, excludeId ?? null],
  );
  if (rows.some((r) => r.code_taken)) throw conflict(`Vendor code ${input.vendorCode} is already in use.`);
  if (rows.some((r) => r.email_taken)) throw conflict(`Email ${input.email} is already registered to another vendor.`);
}

export async function createVendor(db: Db, input: VendorInput) {
  await assertUnique(db, input);
  const { rows } = await db.query(
    `insert into public.vendors (vendor_code, vendor_name, email, contact_person, mobile_number, address)
     values ($1, $2, lower($3), $4, $5, $6) returning *`,
    [input.vendorCode, input.vendorName, input.email, input.contactPerson, input.mobileNumber, input.address],
  );
  return mapVendor(rows[0]);
}

export async function getVendor(db: Db, id: string) {
  const { rows } = await db.query('select * from public.vendors where id = $1', [id]);
  if (!rows[0]) throw notFound('Vendor not found');
  const [{ rows: stats }, { rows: regs }, { rows: recent }] = await sequential([
    () => db.query(
      `select current_status, count(*)::int as count from public.pod_submissions where vendor_id = $1 group by current_status`,
      [id],
    ),
    () => db.query(
      `select r.*, p.full_name as reviewer_name
         from public.vendor_registration_requests r
         left join public.user_profiles p on p.id = r.reviewed_by
        where r.vendor_id = $1 order by r.requested_at desc`,
      [id],
    ),
    () => db.query(
      `select id, submission_number, po_number, invoice_number, delivery_date, submitted_at, current_status
         from public.pod_submissions where vendor_id = $1 order by submitted_at desc limit 10`,
      [id],
    ),
  ]);
  const counts = { total: 0, PENDING: 0, UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>;
  for (const s of stats) {
    counts[s.current_status] = s.count;
    counts.total += s.count;
  }
  return {
    vendor: mapVendor(rows[0]),
    stats: counts,
    registrations: regs.map(mapRegistration),
    recentSubmissions: recent.map((r) => ({
      id: r.id,
      submissionNumber: r.submission_number,
      poNumber: r.po_number,
      invoiceNumber: r.invoice_number,
      deliveryDate: r.delivery_date,
      submittedAt: r.submitted_at,
      status: r.current_status,
    })),
  };
}

export async function updateVendor(db: Db, id: string, input: VendorInput) {
  const { rows: existing } = await db.query('select * from public.vendors where id = $1 for update', [id]);
  const v = existing[0];
  if (!v) throw notFound('Vendor not found');
  if (v.account_status !== 'NOT_REGISTERED' && v.email.toLowerCase() !== input.email.toLowerCase()) {
    throw badRequest('The registered email cannot be changed after the vendor has activated their login.');
  }
  await assertUnique(db, input, id);
  const { rows } = await db.query(
    `update public.vendors
        set vendor_code = $2, vendor_name = $3, email = lower($4), contact_person = $5, mobile_number = $6, address = $7
      where id = $1 returning *`,
    [id, input.vendorCode, input.vendorName, input.email, input.contactPerson, input.mobileNumber, input.address],
  );
  return mapVendor(rows[0]);
}

/** Soft delete. Historical POD records are always preserved. */
export async function deactivateVendor(db: Db, id: string) {
  const { rows } = await db.query(
    `update public.vendors set account_status = 'DEACTIVATED' where id = $1 and account_status <> 'DEACTIVATED' returning *`,
    [id],
  );
  if (!rows[0]) {
    const { rowCount } = await db.query('select 1 from public.vendors where id = $1', [id]);
    if (!rowCount) throw notFound('Vendor not found');
    throw conflict('Vendor is already deactivated.');
  }
  // Close any open registration request
  await db.query(
    `update public.vendor_registration_requests
        set approval_status = 'REJECTED', reviewed_at = now(), reviewed_by = public.current_profile_id(),
            remarks = coalesce(remarks, 'Vendor deactivated')
      where vendor_id = $1 and approval_status = 'PENDING'`,
    [id],
  );
  return mapVendor(rows[0]);
}

/** Reactivate a DEACTIVATED or REJECTED vendor (restores login if one exists). */
export async function reactivateVendor(db: Db, id: string) {
  const { rows: existing } = await db.query('select account_status from public.vendors where id = $1 for update', [id]);
  if (!existing[0]) throw notFound('Vendor not found');
  if (!['DEACTIVATED', 'REJECTED'].includes(existing[0].account_status)) {
    throw conflict('Only deactivated or rejected vendors can be reactivated.');
  }
  const { rows: prof } = await db.query(`select 1 from public.user_profiles where vendor_id = $1`, [id]);
  const next = prof.length ? 'ACTIVE' : 'NOT_REGISTERED';
  const { rows } = await db.query(`update public.vendors set account_status = $2::vendor_account_status where id = $1 returning *`, [id, next]);
  if (next === 'ACTIVE') {
    afterCommit(db, () =>
      notify.vendor(id, { title: 'Account activated', message: 'Your vendor account is now active. You can upload POD documents.', link: '/vendor' }),
    );
  }
  return mapVendor(rows[0]);
}

// ---------------------------------------------------------------------
// Registration requests
// ---------------------------------------------------------------------
export const mapRegistration = (r: any) => ({
  id: r.id,
  vendorId: r.vendor_id,
  requestedAt: r.requested_at,
  approvalStatus: r.approval_status,
  reviewedAt: r.reviewed_at,
  reviewerName: r.reviewer_name ?? null,
  remarks: r.remarks,
  ...(r.vendor_name
    ? {
        vendor: {
          vendorName: r.vendor_name,
          vendorCode: r.vendor_code,
          email: r.email,
          contactPerson: r.contact_person,
          mobileNumber: r.mobile_number,
          accountStatus: r.account_status,
        },
      }
    : {}),
});

export async function listRegistrations(db: Db, q: ListQuery) {
  const w = new Where();
  const status = q.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(q.status) ? q.status : undefined;
  if (status) w.add('r.approval_status = ?::registration_status', status);
  if (q.search) {
    const p = `%${escapeLike(q.search.toLowerCase())}%`;
    w.add('(lower(v.vendor_name) like ? or lower(v.vendor_code) like ? or lower(v.email) like ?)', p, p, p);
  }
  const base = `from public.vendor_registration_requests r join public.vendors v on v.id = r.vendor_id
                left join public.user_profiles p on p.id = r.reviewed_by ${w}`;
  const { rows: c } = await db.query(`select count(*)::int as total ${base}`, w.params);
  const limit = w.param(q.pageSize);
  const offset = w.param((q.page - 1) * q.pageSize);
  const { rows } = await db.query(
    `select r.*, v.vendor_name, v.vendor_code, v.email, v.contact_person, v.mobile_number, v.account_status,
            p.full_name as reviewer_name
       ${base}
      order by (r.approval_status = 'PENDING') desc, r.requested_at desc
      limit ${limit} offset ${offset}`,
    w.params,
  );
  return { items: rows.map(mapRegistration), total: c[0].total as number, page: q.page, pageSize: q.pageSize };
}

export async function reviewRegistration(db: Db, id: string, decision: 'APPROVED' | 'REJECTED', remarks: string | null) {
  const { rows } = await db.query(
    `update public.vendor_registration_requests
        set approval_status = $2::registration_status, remarks = $3, reviewed_at = now(), reviewed_by = public.current_profile_id()
      where id = $1 and approval_status = 'PENDING'
      returning vendor_id`,
    [id, decision, remarks],
  );
  if (!rows[0]) {
    const { rowCount } = await db.query('select 1 from public.vendor_registration_requests where id = $1', [id]);
    if (!rowCount) throw notFound('Registration request not found');
    throw conflict('This registration request has already been reviewed.');
  }
  const vendorId = rows[0].vendor_id as string;
  const nextStatus = decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
  const { rows: v } = await db.query(
    `update public.vendors set account_status = $2::vendor_account_status
      where id = $1 and account_status = 'PENDING_APPROVAL' returning *`,
    [vendorId, nextStatus],
  );
  if (!v[0]) throw conflict('The vendor account is no longer awaiting approval.');

  if (decision === 'APPROVED') {
    afterCommit(db, () =>
      notify.vendor(vendorId, {
        title: 'Account approved',
        message: 'Welcome to the RCPL Vendor POD Portal. Your account has been approved.',
        link: '/vendor',
      }),
    );
  }
  return mapVendor(v[0]);
}
