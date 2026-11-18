import path from 'node:path';
import crypto from 'node:crypto';
import { afterCommit, withUser, type Db } from '../db/pool.js';
import { storage } from '../storage/index.js';
import { assertFileSignature } from '../middleware/upload.js';
import type { AuthContext } from '../types/auth.js';
import type { ListQuery } from '../utils/validation.js';
import { Where, escapeLike } from '../utils/sql.js';
import { sequential } from '../utils/sql.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { notify } from './notification.service.js';

export type PodStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
const POD_STATUSES: PodStatus[] = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

export interface PodFiles {
  podDocument?: Express.Multer.File;
  supportingPhoto?: Express.Multer.File;
}

export const mapSubmission = (r: any) => ({
  id: r.id,
  submissionNumber: r.submission_number,
  vendorId: r.vendor_id,
  vendorName: r.vendor_name ?? undefined,
  vendorCode: r.vendor_code ?? undefined,
  poNumber: r.po_number,
  invoiceNumber: r.invoice_number,
  deliveryDate: r.delivery_date,
  deliveryReference: r.delivery_reference,
  submittedAt: r.submitted_at,
  status: r.current_status as PodStatus,
  currentVersion: r.current_version,
  adminRemarks: r.admin_remarks,
  reviewedAt: r.reviewed_at,
  reviewerName: r.reviewer_name ?? null,
  updatedAt: r.updated_at,
});

const mapDocument = (r: any) => ({
  id: r.id,
  documentType: r.document_type,
  fileName: r.file_name,
  fileType: r.file_type,
  fileSize: r.file_size,
  versionNumber: r.version_number,
  uploadedAt: r.uploaded_at,
});

const mapHistory = (r: any) => ({
  id: r.id,
  previousStatus: r.previous_status,
  newStatus: r.new_status,
  remarks: r.remarks,
  versionNumber: r.version_number,
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name,
  updatedByRole: r.updated_by_role,
});

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------
function validateFiles(files: PodFiles, requirePod: boolean) {
  if (requirePod && !files.podDocument) throw badRequest('Please attach the POD document.');
  for (const f of [files.podDocument, files.supportingPhoto]) if (f) assertFileSignature(f);
  if (files.supportingPhoto && !files.supportingPhoto.mimetype.startsWith('image/')) {
    throw badRequest('The supporting photograph must be a JPG or PNG image.');
  }
}

const safeName = (name: string) => path.basename(name).replace(/[^\w.\- ()]/g, '_').slice(0, 150) || 'document';

/** Uploads files to storage and records them in pod_documents (inside the caller's txn). */
async function storeDocuments(
  db: Db,
  ctx: AuthContext,
  submissionId: string,
  version: number,
  files: PodFiles,
  uploaded: string[],
) {
  const entries: Array<['POD' | 'SUPPORTING_PHOTO', Express.Multer.File]> = [];
  if (files.podDocument) entries.push(['POD', files.podDocument]);
  if (files.supportingPhoto) entries.push(['SUPPORTING_PHOTO', files.supportingPhoto]);

  for (const [type, file] of entries) {
    const ext = path.extname(file.originalname).toLowerCase();
    const key = `vendors/${ctx.vendorId}/${submissionId}/v${version}/${type.toLowerCase()}-${crypto.randomUUID()}${ext}`;
    await storage.put(key, file.buffer, file.mimetype);
    uploaded.push(key);
    await db.query(
      `insert into public.pod_documents (submission_id, document_type, file_name, storage_path, file_type, file_size, version_number, uploaded_by)
       values ($1, $2::pod_document_type, $3, $4, $5, $6, $7, public.current_profile_id())`,
      [submissionId, type, safeName(file.originalname), key, file.mimetype, file.size, version],
    );
  }
}

async function cleanup(paths: string[]) {
  await Promise.all(paths.map((p) => storage.remove(p).catch(() => undefined)));
}

function duplicateInvoice(err: any, invoice: string) {
  if (err?.code === '23505' && String(err.constraint ?? '').includes('pod_vendor_invoice')) {
    return conflict(`A POD has already been submitted for invoice ${invoice}. If it was rejected, use Re-upload from My Submissions.`);
  }
  return err;
}

// ---------------------------------------------------------------------
// Vendor operations (vendor user context; RLS limits rows to own vendor)
// ---------------------------------------------------------------------
export interface SubmissionInput {
  poNumber: string;
  invoiceNumber: string;
  deliveryDate: string;
  deliveryReference: string | null;
}

export async function createSubmission(ctx: AuthContext, input: SubmissionInput, files: PodFiles) {
  validateFiles(files, true);
  const uploaded: string[] = [];
  try {
    return await withUser(ctx.authUserId, async (db) => {
      const { rows } = await db.query(
        `insert into public.pod_submissions (vendor_id, po_number, invoice_number, delivery_date, delivery_reference, submitted_by)
         values ($1, $2, $3, $4, $5, public.current_profile_id()) returning *`,
        [ctx.vendorId, input.poNumber, input.invoiceNumber, input.deliveryDate, input.deliveryReference],
      );
      const sub = rows[0];
      await storeDocuments(db, ctx, sub.id, 1, files, uploaded);
      await db.query(
        `insert into public.pod_status_history (submission_id, previous_status, new_status, remarks, version_number, updated_by)
         values ($1, null, 'UNDER_REVIEW', 'POD submitted by vendor', 1, public.current_profile_id())`,
        [sub.id],
      );
      afterCommit(db, async () => {
        await notify.vendor(ctx.vendorId!, {
          title: 'POD submitted',
          message: `${sub.submission_number} (Invoice ${sub.invoice_number}) was submitted and is under review.`,
          link: `/vendor/submissions/${sub.id}`,
        });
        await notify.admins({
          title: 'New POD submission',
          message: `${ctx.vendorName} submitted ${sub.submission_number} for invoice ${sub.invoice_number}.`,
          link: `/admin/submissions/${sub.id}`,
        });
      });
      return mapSubmission(sub);
    });
  } catch (err) {
    await cleanup(uploaded);
    throw duplicateInvoice(err, input.invoiceNumber);
  }
}

export interface ReuploadInput {
  poNumber?: string;
  invoiceNumber?: string;
  deliveryDate?: string;
  deliveryReference?: string | null;
  note?: string | null;
}

export async function reuploadSubmission(ctx: AuthContext, id: string, input: ReuploadInput, files: PodFiles) {
  validateFiles(files, true);
  const uploaded: string[] = [];
  try {
    return await withUser(ctx.authUserId, async (db) => {
      const { rows: cur } = await db.query('select * from public.pod_submissions where id = $1 for update', [id]);
      const sub = cur[0];
      if (!sub) throw notFound('Submission not found');
      if (sub.current_status !== 'REJECTED') throw conflict('Only rejected submissions can be re-uploaded.');

      const version = sub.current_version + 1;
      await storeDocuments(db, ctx, sub.id, version, files, uploaded);
      const { rows } = await db.query(
        `update public.pod_submissions
            set current_status = 'UNDER_REVIEW', current_version = $2,
                po_number = coalesce($3, po_number), invoice_number = coalesce($4, invoice_number),
                delivery_date = coalesce($5::date, delivery_date),
                delivery_reference = case when $6::boolean then $7 else delivery_reference end
          where id = $1 returning *`,
        [
          id,
          version,
          input.poNumber ?? null,
          input.invoiceNumber ?? null,
          input.deliveryDate ?? null,
          input.deliveryReference !== undefined,
          input.deliveryReference ?? null,
        ],
      );
      const remark = `Re-uploaded corrected document (version ${version})${input.note ? `: ${input.note}` : ''}`;
      await db.query(
        `insert into public.pod_status_history (submission_id, previous_status, new_status, remarks, version_number, updated_by)
         values ($1, 'REJECTED', 'UNDER_REVIEW', $2, $3, public.current_profile_id())`,
        [id, remark, version],
      );
      const updated = rows[0];
      afterCommit(db, async () => {
        await notify.vendor(ctx.vendorId!, {
          title: 'POD re-submitted',
          message: `${updated.submission_number} version ${version} was submitted and is under review.`,
          link: `/vendor/submissions/${id}`,
        });
        await notify.admins({
          title: 'POD re-uploaded',
          message: `${ctx.vendorName} re-uploaded ${updated.submission_number} (version ${version}).`,
          link: `/admin/submissions/${id}`,
        });
      });
      return mapSubmission(updated);
    });
  } catch (err) {
    await cleanup(uploaded);
    throw duplicateInvoice(err, input.invoiceNumber ?? '');
  }
}

export async function vendorDashboard(db: Db) {
  const [{ rows: stats }, { rows: recent }] = await sequential([
    () => db.query(`select current_status, count(*)::int as count from public.pod_submissions group by current_status`),
    () => db.query(`select * from public.pod_submissions order by submitted_at desc limit 5`),
  ]);
  return { stats: toStats(stats), recentSubmissions: recent.map(mapSubmission) };
}

function toStats(rows: Array<{ current_status: PodStatus; count: number }>) {
  const s = { total: 0, PENDING: 0, UNDER_REVIEW: 0, APPROVED: 0, REJECTED: 0 };
  for (const r of rows) {
    s[r.current_status] = r.count;
    s.total += r.count;
  }
  return s;
}

// ---------------------------------------------------------------------
// Shared list / detail (vendor or admin context — RLS decides visibility)
// ---------------------------------------------------------------------
export async function listSubmissions(db: Db, q: ListQuery) {
  const w = new Where();
  if (q.status && POD_STATUSES.includes(q.status as PodStatus)) w.add('s.current_status = ?::pod_status', q.status);
  if (q.po) w.add(`lower(s.po_number) like ? escape '\\'`, `%${escapeLike(q.po.toLowerCase())}%`);
  if (q.from) w.add('s.submitted_at >= ?::date', q.from);
  if (q.to) w.add(`s.submitted_at < (?::date + interval '1 day')`, q.to);
  if (q.vendorId) w.add('s.vendor_id = ?', q.vendorId);
  if (q.search) {
    const p = `%${escapeLike(q.search.toLowerCase())}%`;
    w.add(
      `(lower(s.submission_number) like ? or lower(s.po_number) like ? or lower(s.invoice_number) like ? or lower(v.vendor_name) like ? or lower(v.vendor_code) like ?)`,
      p, p, p, p, p,
    );
  }
  const base = `from public.pod_submissions s join public.vendors v on v.id = s.vendor_id ${w}`;
  const { rows: c } = await db.query(`select count(*)::int as total ${base}`, w.params);
  const limit = w.param(q.pageSize);
  const offset = w.param((q.page - 1) * q.pageSize);
  const { rows } = await db.query(
    `select s.*, v.vendor_name, v.vendor_code ${base} order by s.submitted_at desc limit ${limit} offset ${offset}`,
    w.params,
  );
  return { items: rows.map(mapSubmission), total: c[0].total as number, page: q.page, pageSize: q.pageSize };
}

export async function getSubmission(db: Db, id: string) {
  const { rows } = await db.query(
    `select s.*, v.vendor_name, v.vendor_code, v.email as vendor_email, v.contact_person, v.mobile_number,
            rp.full_name as reviewer_name
       from public.pod_submissions s
       join public.vendors v on v.id = s.vendor_id
       left join public.user_profiles rp on rp.id = s.reviewed_by
      where s.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('Submission not found');
  const [{ rows: docs }, { rows: history }] = await sequential([
    () => db.query(`select * from public.pod_documents where submission_id = $1 order by version_number desc, document_type`, [id]),
    () => db.query(
      `select h.*, coalesce(v.vendor_name, p.full_name, p.email) as updated_by_name, p.role as updated_by_role
         from public.pod_status_history h
         left join public.user_profiles p on p.id = h.updated_by
         left join public.vendors v on v.id = p.vendor_id
        where h.submission_id = $1 order by h.updated_at desc`,
      [id],
    ),
  ]);
  const r = rows[0];
  return {
    submission: mapSubmission(r),
    vendor: { name: r.vendor_name, code: r.vendor_code, email: r.vendor_email, contactPerson: r.contact_person, mobileNumber: r.mobile_number },
    documents: docs.map(mapDocument),
    history: history.map(mapHistory),
  };
}

// ---------------------------------------------------------------------
// Admin operations (admin user context)
// ---------------------------------------------------------------------
export async function reviewSubmission(db: Db, id: string, decision: 'APPROVED' | 'REJECTED', remarks: string | null) {
  const { rows: cur } = await db.query('select * from public.pod_submissions where id = $1 for update', [id]);
  const sub = cur[0];
  if (!sub) throw notFound('Submission not found');
  if (sub.current_status !== 'UNDER_REVIEW') throw conflict(`This submission is ${sub.current_status.replace('_', ' ').toLowerCase()} and cannot be reviewed.`);
  if (decision === 'REJECTED' && !remarks) throw badRequest('Rejection remarks are mandatory.');

  const { rows } = await db.query(
    `update public.pod_submissions
        set current_status = $2::pod_status, admin_remarks = $3, reviewed_by = public.current_profile_id(), reviewed_at = now()
      where id = $1 returning *`,
    [id, decision, remarks],
  );
  await db.query(
    `insert into public.pod_status_history (submission_id, previous_status, new_status, remarks, version_number, updated_by)
     values ($1, 'UNDER_REVIEW', $2::pod_status, $3, $4, public.current_profile_id())`,
    [id, decision, remarks ?? (decision === 'APPROVED' ? 'POD approved' : null), sub.current_version],
  );
  const updated = rows[0];
  afterCommit(db, () =>
    notify.vendor(updated.vendor_id, {
      title: decision === 'APPROVED' ? 'POD approved' : 'POD rejected — action required',
      message:
        decision === 'APPROVED'
          ? `${updated.submission_number} (Invoice ${updated.invoice_number}) has been approved.`
          : `${updated.submission_number} (Invoice ${updated.invoice_number}) was rejected. Remarks: ${remarks}. Please re-upload the corrected document.`,
      link: `/vendor/submissions/${id}`,
    }),
  );
  return mapSubmission(updated);
}

export async function adminDashboard(db: Db) {
  const [{ rows: vendorStats }, { rows: podStats }, { rows: recent }, { rows: regs }] = await sequential([
    () => db.query(
      `select count(*)::int as total,
              count(*) filter (where account_status = 'ACTIVE')::int as active,
              count(*) filter (where account_status = 'PENDING_APPROVAL')::int as pending_approval,
              count(*) filter (where account_status = 'NOT_REGISTERED')::int as not_registered,
              count(*) filter (where account_status = 'DEACTIVATED')::int as deactivated
         from public.vendors`,
    ),
    () => db.query(`select current_status, count(*)::int as count from public.pod_submissions group by current_status`),
    () => db.query(
      `select s.*, v.vendor_name, v.vendor_code from public.pod_submissions s join public.vendors v on v.id = s.vendor_id
        order by s.submitted_at desc limit 6`,
    ),
    () => db.query(
      `select r.id, r.requested_at, v.id as vendor_id, v.vendor_name, v.vendor_code, v.email
         from public.vendor_registration_requests r join public.vendors v on v.id = r.vendor_id
        where r.approval_status = 'PENDING' order by r.requested_at asc limit 5`,
    ),
  ]);
  const v = vendorStats[0];
  return {
    vendors: { total: v.total, active: v.active, pendingApproval: v.pending_approval, notRegistered: v.not_registered, deactivated: v.deactivated },
    pods: toStats(podStats),
    recentSubmissions: recent.map(mapSubmission),
    pendingRegistrations: regs.map((r) => ({
      id: r.id,
      requestedAt: r.requested_at,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      vendorCode: r.vendor_code,
      email: r.email,
    })),
  };
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------
/** Returns document metadata only if RLS lets the caller see it. */
export async function getDocumentForDownload(db: Db, documentId: string) {
  const { rows } = await db.query(
    `select id, file_name, file_type, file_size, storage_path from public.pod_documents where id = $1`,
    [documentId],
  );
  if (!rows[0]) throw notFound('Document not found');
  return rows[0] as { id: string; file_name: string; file_type: string; file_size: number; storage_path: string };
}
