import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, callFn, db } from '@/lib/firebase';
import { AppError, toAppError } from '@/lib/errors';
import { count, endOfDay, fetchPage, searchTerm, startOfDay, type Cursor, type Page } from '@/lib/firestore';
import { toDocument, toHistory, toRegistration, toStaff, toSubmission, toVendor } from './mappers';
import { uploadVersion, type UploadFiles } from './uploads';
import { POD_STATUSES } from './vendorService';
import type {
  AdminDashboard, Category, ListParams, PodStats, RegistrationRequest, StaffRole, StaffUser, Submission, SubmissionDetail, UploadVendor,
  User, Vendor, VendorDetail, VendorInput,
} from '@/types';

/**
 * RCPL staff portal (Admin, Category team, Billing team).
 * Every query is scoped to what the caller's role may read, matching
 * firestore.rules exactly; all writes go through Cloud Functions.
 */

type StaffInput = { email: string; fullName: string; role: StaffRole; categories: Category[] };

const fns = {
  createVendor: callFn<VendorInput, { vendorId: string }>('createVendor'),
  updateVendor: callFn<VendorInput & { vendorId: string }, { vendorId: string }>('updateVendor'),
  deactivateVendor: callFn<{ vendorId: string }, { vendorId: string; accountStatus: string }>('deactivateVendor'),
  reactivateVendor: callFn<{ vendorId: string }, { vendorId: string; accountStatus: string }>('reactivateVendor'),
  reviewRegistration: callFn<{ requestId: string; decision: 'APPROVED' | 'REJECTED'; remarks?: string | null }, { vendorId: string; accountStatus: string }>('reviewVendorRegistration'),
  podAction: callFn<{ submissionId: string; action: 'FORWARD' | 'SEND_BACK' | 'MARK_BILLED'; remarks?: string | null }, { submissionId: string; status: string }>('updatePodStatus'),
  listUploadVendors: callFn<void, { vendors: UploadVendor[] }>('listUploadVendors'),
  createPod: callFn<Record<string, unknown>, { submissionId: string; submissionNumber: string; status: string }>('createPodSubmission'),
  createStaff: callFn<StaffInput, { uid: string }>('createStaffUser'),
  updateStaff: callFn<StaffInput & { uid: string }, { uid: string }>('updateStaffUser'),
  setStaffActive: callFn<{ uid: string; active: boolean }, { uid: string; active: boolean }>('setStaffActive'),
};

const wrap = async <T>(p: Promise<T>, fallback: string) => {
  try {
    return await p;
  } catch (e) {
    throw toAppError(e, fallback);
  }
};

/** Constraints that limit podSubmissions to the caller's scope. */
export function scopeConstraints(user: User, category?: string): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (user.role === 'BILLING') c.push(where('billingVisible', '==', true));
  if (category) c.push(where('category', '==', category));
  else if (user.role === 'CATEGORY') c.push(where('category', 'in', user.categories.length ? user.categories.slice(0, 30) : ['__none__']));
  return c;
}

async function podStats(scope: QueryConstraint[]): Promise<PodStats> {
  const col = collection(db, 'podSubmissions');
  const counts = await Promise.all(POD_STATUSES.map((s) => count(query(col, ...scope, where('currentStatus', '==', s)))));
  return { SUBMITTED: counts[0], RESUBMISSION_REQUESTED: counts[1], FORWARDED_TO_BILLING: counts[2], BILLED: counts[3], total: counts.reduce((a, b) => a + b, 0) };
}

async function getVendorSnap(id: string) {
  const snap = await getDoc(doc(db, 'vendors', id));
  if (!snap.exists()) throw new AppError('Vendor not found.', 'NOT_FOUND');
  return snap;
}

export const adminService = {
  dashboard: (user: User) =>
    wrap(
      (async (): Promise<AdminDashboard> => {
        const scope = scopeConstraints(user);
        const isAdmin = user.role === 'ADMIN';
        const vendorsCol = collection(db, 'vendors');
        const byStatus = (s: string) => count(query(vendorsCol, where('accountStatus', '==', s)));
        const [pods, recent, vendorCounts, regs] = await Promise.all([
          podStats(scope),
          getDocs(query(collection(db, 'podSubmissions'), ...scope, orderBy('submittedAt', 'desc'), limit(6))),
          isAdmin ? Promise.all([count(vendorsCol), byStatus('ACTIVE'), byStatus('PENDING_APPROVAL'), byStatus('NOT_REGISTERED'), byStatus('DEACTIVATED')]) : null,
          isAdmin ? getDocs(query(collection(db, 'vendorRegistrationRequests'), where('approvalStatus', '==', 'PENDING'), orderBy('requestedAt', 'asc'), limit(5))) : null,
        ]);
        return {
          vendors: vendorCounts
            ? { total: vendorCounts[0], active: vendorCounts[1], pendingApproval: vendorCounts[2], notRegistered: vendorCounts[3], deactivated: vendorCounts[4] }
            : null,
          pods,
          recentSubmissions: recent.docs.map(toSubmission),
          pendingRegistrations: (regs?.docs ?? []).map((d) => {
            const r = toRegistration(d);
            return { id: r.id, requestedAt: r.requestedAt, vendorId: r.vendorId, vendorName: r.vendor!.vendorName, vendorCode: r.vendor!.vendorCode, email: r.vendor!.email };
          }),
        };
      })(),
      'Could not load the dashboard.',
    ),

  /** Sidebar badges: items waiting for this role. */
  badgeCounts: (user: User) =>
    wrap(
      (async () => {
        const col = collection(db, 'podSubmissions');
        const scope = scopeConstraints(user);
        const waitingStatus = user.role === 'BILLING' ? 'FORWARDED_TO_BILLING' : 'SUBMITTED';
        const [pods, registrations] = await Promise.all([
          count(query(col, ...scope, where('currentStatus', '==', waitingStatus))),
          user.role === 'ADMIN' ? count(query(collection(db, 'vendorRegistrationRequests'), where('approvalStatus', '==', 'PENDING'))) : Promise.resolve(0),
        ]);
        return { pods, registrations };
      })(),
      'Could not load counts.',
    ),

  // ---- POD submissions ----
  listSubmissions: (user: User, p: ListParams, after: Cursor | null): Promise<Page<Submission>> => {
    const c = scopeConstraints(user, p.category);
    if (p.vendorId) c.push(where('vendorId', '==', p.vendorId));
    if (p.status) c.push(where('currentStatus', '==', p.status));
    const term = searchTerm(p.search);
    if (term) c.push(where('searchKeywords', 'array-contains', term));
    if (p.from) c.push(where('submittedAt', '>=', startOfDay(p.from)));
    if (p.to) c.push(where('submittedAt', '<', endOfDay(p.to)));
    return wrap(fetchPage(query(collection(db, 'podSubmissions'), ...c), [orderBy('submittedAt', 'desc')], toSubmission, p.pageSize ?? 15, after), 'Could not load submissions.');
  },

  getSubmission: (user: User, id: string) =>
    wrap(
      (async (): Promise<SubmissionDetail> => {
        const snap = await getDoc(doc(db, 'podSubmissions', id));
        if (!snap.exists()) throw new AppError('Submission not found.', 'NOT_FOUND');
        const s = toSubmission(snap);
        // Child queries must carry the same constraints the rules check.
        const byId = (c: string) =>
          query(collection(db, c), where('submissionId', '==', id), ...(user.role === 'CATEGORY' ? [where('category', '==', s.category)] : []));
        const [docs, hist, vendor] = await Promise.all([
          getDocs(byId('podDocuments')),
          getDocs(byId('podStatusHistory')),
          user.role === 'BILLING' ? Promise.resolve(null) : getDoc(doc(db, 'vendors', s.vendorId)).catch(() => null),
        ]);
        const v = vendor?.data() ?? {};
        return {
          submission: s,
          vendor: { name: v.vendorName ?? s.vendorName, code: v.vendorCode ?? s.vendorCode, email: v.email ?? '', contactPerson: v.contactPerson ?? null, mobileNumber: v.mobileNumber ?? null },
          documents: docs.docs.map(toDocument).sort((a, b) => b.versionNumber - a.versionNumber || a.documentType.localeCompare(b.documentType)),
          history: hist.docs.map(toHistory).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        };
      })(),
      'Could not load the submission.',
    ),

  forward: (id: string, remarks?: string) => wrap(fns.podAction({ submissionId: id, action: 'FORWARD', remarks: remarks || null }), 'Could not forward the POD.'),
  sendBack: (id: string, remarks: string) => wrap(fns.podAction({ submissionId: id, action: 'SEND_BACK', remarks }), 'Could not send the POD back.'),
  markBilled: (id: string, remarks?: string) => wrap(fns.podAction({ submissionId: id, action: 'MARK_BILLED', remarks: remarks || null }), 'Could not mark the POD as billed.'),

  /** Vendors the caller may upload for (Admin: all; Category: their categories). */
  uploadVendors: () => wrap(fns.listUploadVendors().then((r) => r.vendors), 'Could not load vendors.'),

  /** Category team / Admin uploads a POD on a vendor's behalf (e.g. received on WhatsApp). */
  async uploadForVendor(
    vendorId: string,
    fields: { category: Category; poNumber: string; invoiceNumber: string; deliveryDate: string; deliveryReference?: string; forwardNow?: boolean },
    files: UploadFiles,
    onProgress?: (pct: number) => void,
  ) {
    const submissionId = doc(collection(db, 'podSubmissions')).id;
    try {
      await uploadVersion(vendorId, submissionId, 1, files, onProgress);
      return await fns.createPod({ submissionId, vendorId, ...fields, deliveryReference: fields.deliveryReference || null });
    } catch (e) {
      throw toAppError(e, 'Upload failed. Please try again.');
    }
  },

  // ---- Vendors (Admin) ----
  listVendors: async (p: ListParams, after: Cursor | null): Promise<Page<Vendor>> => {
    const c: QueryConstraint[] = [];
    if (p.status) c.push(where('accountStatus', '==', p.status));
    const term = searchTerm(p.search);
    // Firestore allows one array-contains per query: search takes priority, category is then filtered locally.
    if (term) c.push(where('searchKeywords', 'array-contains', term));
    else if (p.category) c.push(where('categories', 'array-contains', p.category));
    const page = await wrap(fetchPage(query(collection(db, 'vendors'), ...c), [orderBy('createdAt', 'desc')], toVendor, p.pageSize ?? 10, after), 'Could not load vendors.');
    if (term && p.category) page.items = page.items.filter((v) => v.categories.includes(p.category as Category));
    return page;
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

  // ---- Registrations (Admin) ----
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

  // ---- Team (Admin) ----
  listStaff: () =>
    wrap(
      getDocs(query(collection(db, 'userProfiles'), where('role', 'in', ['ADMIN', 'CATEGORY', 'BILLING']), orderBy('createdAt', 'desc'), limit(500))).then((s) =>
        s.docs.map(toStaff),
      ),
      'Could not load the team.',
    ),
  /** Creates the login, then emails a "set your password" link (Firebase Auth). */
  async createStaff(input: StaffInput) {
    const r = await wrap(fns.createStaff(input), 'Could not create the user.');
    await adminService.sendInvite(input.email);
    return r;
  },
  updateStaff: (uid: string, input: Omit<StaffInput, 'email'>) => wrap(fns.updateStaff({ uid, email: '', ...input }), 'Could not update the user.'),
  setStaffActive: (uid: string, active: boolean) => wrap(fns.setStaffActive({ uid, active }), 'Could not update the user.'),
  sendInvite: (email: string) =>
    wrap(sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/admin/login` }), 'The user was created, but the password email could not be sent. Use "Resend invite".'),
};

export type { StaffUser };
