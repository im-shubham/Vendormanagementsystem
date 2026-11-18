import { collection, doc, getDoc, getDocs, orderBy, query, where, type QueryConstraint, limit } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { callFn, db, storage } from '@/lib/firebase';
import { AppError, toAppError } from '@/lib/errors';
import { count, endOfDay, fetchPage, searchTerm, startOfDay, type Cursor, type Page } from '@/lib/firestore';
import { toDocument, toHistory, toSubmission } from './mappers';
import type { ListParams, PodStatus, Submission, SubmissionDetail, VendorDashboard } from '@/types';

/** Firestore/Storage reads below are authorised by security rules; writes go through Cloud Functions. */

const STATUSES: PodStatus[] = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];
const createFn = callFn<Record<string, unknown>, { submissionId: string; submissionNumber: string; status: string }>('createPodSubmission');
const resubmitFn = callFn<Record<string, unknown>, { submissionId: string; version: number; status: string }>('resubmitPodSubmission');

export interface UploadFiles {
  podDocument: File;
  supportingPhoto?: File | null;
}

const ext = (f: File) => (f.name.split('.').pop() ?? '').toLowerCase();

/** Upload to pod-documents/{vendorId}/{submissionId}/version-{n}/ (storage.rules enforce ownership). */
async function uploadVersion(vendorId: string, submissionId: string, version: number, files: UploadFiles, onProgress?: (pct: number) => void) {
  const list: Array<[string, File]> = [[`pod-document.${ext(files.podDocument)}`, files.podDocument]];
  if (files.supportingPhoto) list.push([`supporting-photo.${ext(files.supportingPhoto)}`, files.supportingPhoto]);
  const total = list.reduce((s, [, f]) => s + f.size, 0);
  const done = new Map<string, number>();
  await Promise.all(
    list.map(
      ([name, file]) =>
        new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(ref(storage, `pod-documents/${vendorId}/${submissionId}/version-${version}/${name}`), file, {
            contentType: file.type,
            customMetadata: { originalName: file.name.slice(0, 150) },
          });
          task.on(
            'state_changed',
            (s) => {
              done.set(name, s.bytesTransferred);
              onProgress?.(Math.round(([...done.values()].reduce((a, b) => a + b, 0) / total) * 100));
            },
            reject,
            () => resolve(),
          );
        }),
    ),
  );
}

function listConstraints(vendorId: string, p: ListParams): QueryConstraint[] {
  const c: QueryConstraint[] = [where('vendorId', '==', vendorId)];
  if (p.status) c.push(where('currentStatus', '==', p.status));
  const term = searchTerm(p.po);
  if (term) c.push(where('searchKeywords', 'array-contains', term));
  if (p.from) c.push(where('submittedAt', '>=', startOfDay(p.from)));
  if (p.to) c.push(where('submittedAt', '<', endOfDay(p.to)));
  return c;
}

export const vendorService = {
  async dashboard(vendorId: string): Promise<VendorDashboard> {
    try {
      const col = collection(db, 'podSubmissions');
      const mine = where('vendorId', '==', vendorId);
      const [counts, recent] = await Promise.all([
        Promise.all(STATUSES.map((s) => count(query(col, mine, where('currentStatus', '==', s))))),
        getDocs(query(col, mine, orderBy('submittedAt', 'desc'), limit(5))),
      ]);
      const stats = { PENDING: counts[0], UNDER_REVIEW: counts[1], APPROVED: counts[2], REJECTED: counts[3], total: counts.reduce((a, b) => a + b, 0) };
      return { stats, recentSubmissions: recent.docs.map(toSubmission) };
    } catch (e) {
      throw toAppError(e, 'Could not load the dashboard.');
    }
  },

  async listSubmissions(vendorId: string, p: ListParams, after: Cursor | null): Promise<Page<Submission>> {
    try {
      return await fetchPage(query(collection(db, 'podSubmissions'), ...listConstraints(vendorId, p)), [orderBy('submittedAt', 'desc')], toSubmission, p.pageSize ?? 10, after);
    } catch (e) {
      throw toAppError(e, 'Could not load submissions.');
    }
  },

  async getSubmission(vendorId: string, id: string): Promise<SubmissionDetail> {
    try {
      const snap = await getDoc(doc(db, 'podSubmissions', id));
      if (!snap.exists()) throw new AppError('Submission not found.', 'NOT_FOUND');
      const scoped = (c: string) => query(collection(db, c), where('vendorId', '==', vendorId), where('submissionId', '==', id));
      const [docs, hist] = await Promise.all([getDocs(scoped('podDocuments')), getDocs(scoped('podStatusHistory'))]);
      const s = toSubmission(snap);
      return {
        submission: s,
        vendor: { name: s.vendorName ?? '', code: s.vendorCode ?? '', email: '', contactPerson: null, mobileNumber: null },
        documents: docs.docs.map(toDocument).sort((a, b) => b.versionNumber - a.versionNumber || a.documentType.localeCompare(b.documentType)),
        history: hist.docs.map(toHistory).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      };
    } catch (e) {
      throw toAppError(e, 'Could not load the submission.');
    }
  },

  /** 1) new submission id 2) upload files 3) Cloud Function validates + creates the record. */
  async createSubmission(
    vendorId: string,
    fields: { poNumber: string; invoiceNumber: string; deliveryDate: string; deliveryReference?: string },
    files: UploadFiles,
    onProgress?: (pct: number) => void,
  ) {
    const submissionId = doc(collection(db, 'podSubmissions')).id;
    try {
      await uploadVersion(vendorId, submissionId, 1, files, onProgress);
      return await createFn({ submissionId, ...fields, deliveryReference: fields.deliveryReference || null });
    } catch (e) {
      throw toAppError(e, 'Upload failed. Please try again.');
    }
  },

  async reupload(
    vendorId: string,
    submission: Submission,
    edits: { poNumber?: string; invoiceNumber?: string; deliveryDate?: string; note?: string },
    files: UploadFiles,
    onProgress?: (pct: number) => void,
  ) {
    try {
      await uploadVersion(vendorId, submission.id, submission.currentVersion + 1, files, onProgress);
      return await resubmitFn({ submissionId: submission.id, ...edits });
    } catch (e) {
      throw toAppError(e, 'Upload failed. Please try again.');
    }
  },
};
