import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { callFn, db } from '@/lib/firebase';
import { AppError, toAppError } from '@/lib/errors';
import { count, endOfDay, fetchPage, searchTerm, startOfDay, type Cursor, type Page } from '@/lib/firestore';
import { toDocument, toHistory, toRegistration, toSubmission, toVendor } from './mappers';
import type {
  AdminDashboard, ListParams, PodStats, RegistrationRequest, Submission, SubmissionDetail, Vendor, VendorDetail, VendorInput,
} from '@/types';

const POD_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const;

const fns = {
  createVendor: callFn<VendorInput, { vendorId: string }>('createVendor'),
  updateVendor: callFn<VendorInput & { vendorId: string }, { vendorId: string }>('updateVendor'),
  deactivateVendor: callFn<{ vendorId: string }, { vendorId: string; accountStatus: string }>('deactivateVendor'),
  reactivateVendor: callFn<{ vendorId: string }, { vendorId: string; accountStatus: string }>('reactivateVendor'),
  reviewRegistration: callFn<{ requestId: string; decision: 'APPROVED' | 'REJECTED'; remarks?: string | null }, { vendorId: string; accountStatus: string }>('reviewVendorRegistration'),
  reviewSubmission: callFn<{ submissionId: string; decision: 'APPROVED' | 'REJECTED'; remarks?: string | null }, { submissionId: string; status: string }>('reviewPodSubmission'),
};

const wrap = async <T>(p: Promise<T>, fallback: string) => {
  try {
    return await p;
  } catch (e) {
    throw toAppError(e, fallback);
  }
};

async function podStats(extra: QueryConstraint[] = []): Promise<PodStats> {
  const col = collection(db, 'podSubmissions');
  const counts = await Promise.all(POD_STATUSES.map((s) => count(query(col, ...extra, where('currentStatus', '==', s)))));
  return { PENDING: counts[0], UNDER_REVIEW: counts[1], APPROVED: counts[2], REJECTED: counts[3], total: counts.reduce((a, b) => a + b, 0) };
}

async function getVendorSnap(id: string) {
  const snap = await getDoc(doc(db, 'vendors', id));
  if (!snap.exists()) throw new AppError('Vendor not found.', 'NOT_FOUND');
  return snap;
}

export const adminService = {
  dashboard: () =>
    wrap(
      (async (): Promise<AdminDashboard> => {
        const vendors = collection(db, 'vendors');
        const byStatus = (s: string) => count(query(vendors, where('accountStatus', '==', s)));
        const [total, active, pendingApproval, notRegistered, deactivated, pods, recent, regs] = await Promise.all([
          count(vendors),
          byStatus('ACTIVE'),
          byStatus('PENDING_APPROVAL'),
          byStatus('NOT_REGISTERED'),
          byStatus('DEACTIVATED'),
          podStats(),
          getDocs(query(collection(db, 'podSubmissions'), orderBy('submittedAt', 'desc'), limit(6))),
          getDocs(query(collection(db, 'vendorRegistrationRequests'), where('approvalStatus', '==', 'PENDING'), orderBy('requestedAt', 'asc'), limit(5))),
        ]);
        return {
          vendors: { total, active, pendingApproval, notRegistered, deactivated },
          pods,
          recentSubmissions: recent.docs.map(toSubmission),
          pendingRegistrations: regs.docs.map((d) => {
            const r = toRegistration(d);
            return { id: r.id, requestedAt: r.requestedAt, vendorId: r.vendorId, vendorName: r.vendor!.vendorName, vendorCode: r.vendor!.vendorCode, email: r.vendor!.email };
          }),
        };
      })(),
      'Could not load the dashboard.',
    ),

  /** Lightweight counts for sidebar badges. */
  badgeCounts: () =>
    wrap(
      Promise.all([
        count(query(collection(db, 'podSubmissions'), where('currentStatus', '==', 'UNDER_REVIEW'))),
        count(query(collection(db, 'vendorRegistrationRequests'), where('approvalStatus', '==', 'PENDING'))),
      ]).then(([review, registrations]) => ({ review, registrations })),
      'Could not load counts.',
    ),

  // ---- Vendors ----
  listVendors: (p: ListParams, after: Cursor | null): Promise<Page<Vendor>> => {
    const c: QueryConstraint[] = [];
    if (p.status) c.push(where('accountStatus', '==', p.status));
    const term = searchTerm(p.search);
    if (term) c.push(where('searchKeywords', 'array-contains', term));
    return wrap(fetchPage(query(collection(db, 'vendors'), ...c), [orderBy('createdAt', 'desc')], toVendor, p.pageSize ?? 10, after), 'Could not load vendors.');
  },

  getVendor: (id: string) =>
    wrap(
      (async (): Promise<VendorDetail> => {
        const [snap, stats, regs, recent] = await Promise.all([
          getVendorSnap(id),
          podStats([where('vendorId', '==', id)]),
          getDocs(query(collection(db, 'vendorRegistrationRequests'), where('vendorId', '==', id), orderBy('requestedAt', 'desc'))),
          getDocs(query(collection(db, 'podSubmissions'), where('vendorId', '==', id), orderBy('submittedAt', 'desc'), limit(10))),
        ]);
        return { vendor: toVendor(snap), stats, registrations: regs.docs.map(toRegistration), recentSubmissions: recent.docs.map(toSubmission) };
      })(),
      'Could not load the vendor.',
    ),

  createVendor: (data: VendorInput) => wrap(fns.createVendor(data), 'Could not create the vendor.'),
  updateVendor: (id: string, data: VendorInput) => wrap(fns.updateVendor({ vendorId: id, ...data }), 'Could not update the vendor.'),
  deactivateVendor: (id: string) => wrap(fns.deactivateVendor({ vendorId: id }), 'Could not deactivate the vendor.'),
  reactivateVendor: (id: string) => wrap(fns.reactivateVendor({ vendorId: id }), 'Could not reactivate the vendor.'),

  // ---- Registrations ----
  listRegistrations: (p: ListParams, after: Cursor | null): Promise<Page<RegistrationRequest>> => {
    const c: QueryConstraint[] = [];
    if (p.status) c.push(where('approvalStatus', '==', p.status));
    const term = searchTerm(p.search);
    if (term) c.push(where('searchKeywords', 'array-contains', term));
    return wrap(
      fetchPage(query(collection(db, 'vendorRegistrationRequests'), ...c), [orderBy('requestedAt', 'desc')], toRegistration, p.pageSize ?? 10, after),
      'Could not load registration requests.',
    );
  },
  approveRegistration: (id: string) => wrap(fns.reviewRegistration({ requestId: id, decision: 'APPROVED' }), 'Approval failed.'),
  rejectRegistration: (id: string, remarks: string) => wrap(fns.reviewRegistration({ requestId: id, decision: 'REJECTED', remarks: remarks || null }), 'Rejection failed.'),

  // ---- POD submissions ----
  listSubmissions: (p: ListParams, after: Cursor | null): Promise<Page<Submission>> => {
    const c: QueryConstraint[] = [];
    if (p.vendorId) c.push(where('vendorId', '==', p.vendorId));
    if (p.status) c.push(where('currentStatus', '==', p.status));
    const term = searchTerm(p.search);
    if (term) c.push(where('searchKeywords', 'array-contains', term));
    if (p.from) c.push(where('submittedAt', '>=', startOfDay(p.from)));
    if (p.to) c.push(where('submittedAt', '<', endOfDay(p.to)));
    return wrap(fetchPage(query(collection(db, 'podSubmissions'), ...c), [orderBy('submittedAt', 'desc')], toSubmission, p.pageSize ?? 15, after), 'Could not load submissions.');
  },

  getSubmission: (id: string) =>
    wrap(
      (async (): Promise<SubmissionDetail> => {
        const snap = await getDoc(doc(db, 'podSubmissions', id));
        if (!snap.exists()) throw new AppError('Submission not found.', 'NOT_FOUND');
        const s = toSubmission(snap);
        const byId = (c: string) => query(collection(db, c), where('submissionId', '==', id));
        const [docs, hist, vendor] = await Promise.all([getDocs(byId('podDocuments')), getDocs(byId('podStatusHistory')), getDoc(doc(db, 'vendors', s.vendorId))]);
        const v = vendor.data() ?? {};
        return {
          submission: s,
          vendor: { name: v.vendorName ?? s.vendorName, code: v.vendorCode ?? s.vendorCode, email: v.email ?? '', contactPerson: v.contactPerson ?? null, mobileNumber: v.mobileNumber ?? null },
          documents: docs.docs.map(toDocument).sort((a, b) => b.versionNumber - a.versionNumber || a.documentType.localeCompare(b.documentType)),
          history: hist.docs.map(toHistory).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        };
      })(),
      'Could not load the submission.',
    ),
  approveSubmission: (id: string, remarks?: string) => wrap(fns.reviewSubmission({ submissionId: id, decision: 'APPROVED', remarks: remarks || null }), 'Approval failed.'),
  rejectSubmission: (id: string, remarks: string) => wrap(fns.reviewSubmission({ submissionId: id, decision: 'REJECTED', remarks }), 'Rejection failed.'),
};
