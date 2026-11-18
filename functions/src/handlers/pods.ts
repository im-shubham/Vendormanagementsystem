import { onCall } from 'firebase-functions/https';
import { COL, FieldValue, db } from '../lib/admin';
import { alreadyExists, conflict, notFound } from '../lib/errors';
import { deleteVersionFolder, verifyVersionFolder, type VerifiedFile } from '../lib/files';
import { requireActiveVendor, requireAdmin } from '../lib/guards';
import { uniqueKey } from '../lib/keys';
import { notifyAdmins, notifyVendor } from '../lib/notifications';
import { buildSearchKeywords } from '../lib/search';
import { parse, schemas } from '../lib/validation';

const COUNTER = () => db.collection(COL.counters).doc('podSubmissions');
const FIRST_NUMBER = 10001;

const submissionKeywords = (s: { submissionNumber: string; poNumber: string; invoiceNumber: string; vendorName: string; vendorCode: string }) =>
  buildSearchKeywords(s.submissionNumber, s.poNumber, s.invoiceNumber, s.vendorName, s.vendorCode);

function writeDocuments(
  tx: FirebaseFirestore.Transaction,
  files: VerifiedFile[],
  meta: { submissionId: string; vendorId: string; version: number; uid: string },
) {
  for (const f of files) {
    tx.create(db.collection(COL.documents).doc(), {
      submissionId: meta.submissionId,
      vendorId: meta.vendorId,
      documentType: f.documentType,
      fileName: f.fileName,
      storagePath: f.storagePath,
      contentType: f.contentType,
      size: f.size,
      versionNumber: meta.version,
      uploadedBy: meta.uid,
      uploadedAt: FieldValue.serverTimestamp(),
    });
  }
}

function writeHistory(
  tx: FirebaseFirestore.Transaction,
  h: { submissionId: string; vendorId: string; previousStatus: string | null; newStatus: string; remarks: string | null; version: number; by: string; byName: string; byRole: 'ADMIN' | 'VENDOR' },
) {
  tx.create(db.collection(COL.history).doc(), {
    submissionId: h.submissionId,
    vendorId: h.vendorId,
    previousStatus: h.previousStatus,
    newStatus: h.newStatus,
    remarks: h.remarks,
    versionNumber: h.version,
    updatedBy: h.by,
    updatedByName: h.byName,
    updatedByRole: h.byRole,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Vendor: create a POD submission.
 * The client first uploads the file(s) to
 *   pod-documents/{vendorId}/{submissionId}/version-1/
 * (storage.rules restrict this to the active vendor's own folder), then calls
 * this function, which validates the files, assigns the unique submission
 * number from a transactional counter and writes all records atomically.
 */
export const createPodSubmission = onCall(async (req) => {
  const vendor = await requireActiveVendor(req);
  const input = parse(schemas.createSubmission, req.data);
  const subRef = db.collection(COL.submissions).doc(input.submissionId);

  // Never touch files of an existing submission.
  if ((await subRef.get()).exists) throw alreadyExists('This submission already exists.');
  const files = await verifyVersionFolder(vendor.vendorId, input.submissionId, 1);

  try {
    const submissionNumber = await db.runTransaction(async (tx) => {
      const invoiceKey = uniqueKey.invoice(vendor.vendorId, input.invoiceNumber);
      const [counter, existing, dup] = await Promise.all([tx.get(COUNTER()), tx.get(subRef), tx.get(invoiceKey)]);
      if (existing.exists) throw alreadyExists('This submission already exists.');
      if (dup.exists) {
        throw alreadyExists(`A POD has already been submitted for invoice ${input.invoiceNumber}. If it was rejected, use Re-upload from My Submissions.`);
      }
      const next = (counter.exists ? (counter.get('next') as number) : FIRST_NUMBER) || FIRST_NUMBER;
      const number = `POD-${next}`;
      const now = FieldValue.serverTimestamp();
      tx.set(COUNTER(), { next: next + 1 }, { merge: true });
      tx.create(invoiceKey, { kind: 'invoice', submissionId: subRef.id });
      tx.create(subRef, {
        submissionNumber: number,
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorCode: vendor.vendorCode,
        poNumber: input.poNumber,
        invoiceNumber: input.invoiceNumber,
        deliveryDate: input.deliveryDate,
        deliveryReference: input.deliveryReference,
        submittedBy: vendor.uid,
        submittedAt: now,
        currentStatus: 'UNDER_REVIEW',
        currentVersion: 1,
        adminRemarks: null,
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        searchKeywords: submissionKeywords({ ...input, submissionNumber: number, vendorName: vendor.vendorName, vendorCode: vendor.vendorCode }),
      });
      writeDocuments(tx, files, { submissionId: subRef.id, vendorId: vendor.vendorId, version: 1, uid: vendor.uid });
      writeHistory(tx, {
        submissionId: subRef.id,
        vendorId: vendor.vendorId,
        previousStatus: null,
        newStatus: 'UNDER_REVIEW',
        remarks: 'POD submitted by vendor',
        version: 1,
        by: vendor.uid,
        byName: vendor.vendorName,
        byRole: 'VENDOR',
      });
      return number;
    });

    await Promise.all([
      notifyVendor(vendor.vendorId, {
        title: 'POD submitted',
        message: `${submissionNumber} (Invoice ${input.invoiceNumber}) was submitted and is under review.`,
        link: `/vendor/submissions/${subRef.id}`,
      }),
      notifyAdmins({
        title: 'New POD submission',
        message: `${vendor.vendorName} submitted ${submissionNumber} for invoice ${input.invoiceNumber}.`,
        link: `/admin/submissions/${subRef.id}`,
      }),
    ]);
    return { submissionId: subRef.id, submissionNumber, status: 'UNDER_REVIEW' };
  } catch (err) {
    await deleteVersionFolder(vendor.vendorId, input.submissionId, 1);
    throw err;
  }
});

/**
 * Vendor: re-submit a REJECTED POD with a corrected document. Files go to
 * version-{n+1}; earlier versions are never overwritten.
 */
export const resubmitPodSubmission = onCall(async (req) => {
  const vendor = await requireActiveVendor(req);
  const input = parse(schemas.resubmit, req.data);
  const subRef = db.collection(COL.submissions).doc(input.submissionId);
  const snap = await subRef.get();
  if (!snap.exists) throw notFound('Submission not found.');
  if (snap.get('vendorId') !== vendor.vendorId) throw notFound('Submission not found.');
  if (snap.get('currentStatus') !== 'REJECTED') throw conflict('Only rejected submissions can be re-uploaded.');
  const version = (snap.get('currentVersion') as number) + 1;
  const files = await verifyVersionFolder(vendor.vendorId, subRef.id, version);

  try {
    const result = await db.runTransaction(async (tx) => {
      const cur = await tx.get(subRef);
      if (cur.get('currentStatus') !== 'REJECTED' || cur.get('currentVersion') !== version - 1) {
        throw conflict('This submission was changed by someone else. Please refresh and try again.');
      }
      const s = cur.data()!;
      const invoiceNumber = input.invoiceNumber ?? s.invoiceNumber;
      if (invoiceNumber.trim().toLowerCase() !== String(s.invoiceNumber).trim().toLowerCase()) {
        const newKey = uniqueKey.invoice(vendor.vendorId, invoiceNumber);
        if ((await tx.get(newKey)).exists) throw alreadyExists(`A POD has already been submitted for invoice ${invoiceNumber}.`);
        tx.delete(uniqueKey.invoice(vendor.vendorId, s.invoiceNumber));
        tx.create(newKey, { kind: 'invoice', submissionId: subRef.id });
      }
      const updated = {
        poNumber: input.poNumber ?? s.poNumber,
        invoiceNumber,
        deliveryDate: input.deliveryDate ?? s.deliveryDate,
        deliveryReference: input.deliveryReference !== undefined ? input.deliveryReference : s.deliveryReference,
      };
      tx.update(subRef, {
        ...updated,
        currentStatus: 'UNDER_REVIEW',
        currentVersion: version,
        updatedAt: FieldValue.serverTimestamp(),
        searchKeywords: submissionKeywords({ ...updated, submissionNumber: s.submissionNumber, vendorName: s.vendorName, vendorCode: s.vendorCode }),
      });
      writeDocuments(tx, files, { submissionId: subRef.id, vendorId: vendor.vendorId, version, uid: vendor.uid });
      writeHistory(tx, {
        submissionId: subRef.id,
        vendorId: vendor.vendorId,
        previousStatus: 'REJECTED',
        newStatus: 'UNDER_REVIEW',
        remarks: `Re-uploaded corrected document (version ${version})${input.note ? `: ${input.note}` : ''}`,
        version,
        by: vendor.uid,
        byName: vendor.vendorName,
        byRole: 'VENDOR',
      });
      return { submissionNumber: s.submissionNumber as string };
    });

    await Promise.all([
      notifyVendor(vendor.vendorId, {
        title: 'POD re-submitted',
        message: `${result.submissionNumber} version ${version} was submitted and is under review.`,
        link: `/vendor/submissions/${subRef.id}`,
      }),
      notifyAdmins({
        title: 'POD re-uploaded',
        message: `${vendor.vendorName} re-uploaded ${result.submissionNumber} (version ${version}).`,
        link: `/admin/submissions/${subRef.id}`,
      }),
    ]);
    return { submissionId: subRef.id, version, status: 'UNDER_REVIEW' };
  } catch (err) {
    await deleteVersionFolder(vendor.vendorId, subRef.id, version);
    throw err;
  }
});

/**
 * Admin: approve or reject. Only UNDER_REVIEW submissions can be reviewed;
 * rejection requires remarks. Status history is recorded atomically.
 */
export const reviewPodSubmission = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const { submissionId, decision, remarks } = parse(schemas.reviewSubmission, req.data);
  const subRef = db.collection(COL.submissions).doc(submissionId);

  const s = await db.runTransaction(async (tx) => {
    const snap = await tx.get(subRef);
    if (!snap.exists) throw notFound('Submission not found.');
    const status = snap.get('currentStatus');
    if (status !== 'UNDER_REVIEW') throw conflict(`This submission is ${String(status).replace('_', ' ').toLowerCase()} and cannot be reviewed.`);
    const now = FieldValue.serverTimestamp();
    tx.update(subRef, { currentStatus: decision, adminRemarks: remarks, reviewedBy: admin.uid, reviewedByName: admin.name, reviewedAt: now, updatedAt: now });
    writeHistory(tx, {
      submissionId,
      vendorId: snap.get('vendorId'),
      previousStatus: 'UNDER_REVIEW',
      newStatus: decision,
      remarks: remarks ?? (decision === 'APPROVED' ? 'POD approved' : null),
      version: snap.get('currentVersion'),
      by: admin.uid,
      byName: admin.name,
      byRole: 'ADMIN',
    });
    return snap.data()!;
  });

  await notifyVendor(s.vendorId, {
    title: decision === 'APPROVED' ? 'POD approved' : 'POD rejected — action required',
    message:
      decision === 'APPROVED'
        ? `${s.submissionNumber} (Invoice ${s.invoiceNumber}) has been approved.`
        : `${s.submissionNumber} (Invoice ${s.invoiceNumber}) was rejected. Remarks: ${remarks}. Please re-upload the corrected document.`,
    link: `/vendor/submissions/${submissionId}`,
  });
  return { submissionId, status: decision };
});

