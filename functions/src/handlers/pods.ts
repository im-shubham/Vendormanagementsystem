import { onCall } from 'firebase-functions/https';
import { COL, FieldValue, db } from '../lib/admin';
import { CATEGORY_LABELS, type Category, type PodStatus, type Role } from '../lib/constants';
import { alreadyExists, conflict, denied, invalid, notFound } from '../lib/errors';
import { deleteVersionFolder, verifyVersionFolder, type VerifiedFile } from '../lib/files';
import { requireCaller, requireStaff, type Caller } from '../lib/guards';
import { uniqueKey } from '../lib/keys';
import { notify } from '../lib/notifications';
import { buildSearchKeywords } from '../lib/search';
import { parse, schemas } from '../lib/validation';

/**
 * POD lifecycle — no approve/reject:
 *
 *   upload (vendor or category team) ─► SUBMITTED (with category team)
 *   SUBMITTED ── Category/Admin "Forward" ──► FORWARDED_TO_BILLING
 *   SUBMITTED ── Category/Admin "Send back" ─► RESUBMISSION_REQUESTED
 *   FORWARDED_TO_BILLING ── Billing/Admin "Mark billed" ─► BILLED
 *   FORWARDED_TO_BILLING ── Billing/Admin "Send back"   ─► RESUBMISSION_REQUESTED
 *   RESUBMISSION_REQUESTED ── vendor or category re-uploads (v+1) ─► SUBMITTED
 */

const COUNTER = () => db.collection(COL.counters).doc('podSubmissions');
const FIRST_NUMBER = 10001;

const who = (c: Caller) => ({ uid: c.uid, name: c.kind === 'VENDOR' ? c.vendorName : c.name, role: (c.kind === 'VENDOR' ? 'VENDOR' : c.role) as Role });

const keywords = (s: { submissionNumber: string; poNumber: string; invoiceNumber: string; vendorName: string; vendorCode: string }) =>
  buildSearchKeywords(s.submissionNumber, s.poNumber, s.invoiceNumber, s.vendorName, s.vendorCode);

function writeDocuments(
  tx: FirebaseFirestore.Transaction,
  files: VerifiedFile[],
  m: { submissionId: string; vendorId: string; category: Category; version: number; uid: string; role: Role },
) {
  for (const f of files) {
    tx.create(db.collection(COL.documents).doc(), {
      submissionId: m.submissionId,
      vendorId: m.vendorId,
      category: m.category,
      documentType: f.documentType,
      fileName: f.fileName,
      storagePath: f.storagePath,
      contentType: f.contentType,
      size: f.size,
      versionNumber: m.version,
      uploadedBy: m.uid,
      uploadedByRole: m.role,
      uploadedAt: FieldValue.serverTimestamp(),
    });
  }
}

function writeHistory(
  tx: FirebaseFirestore.Transaction,
  h: {
    submissionId: string; vendorId: string; category: Category; previousStatus: PodStatus | null; newStatus: PodStatus;
    remarks: string | null; version: number; by: { uid: string; name: string; role: Role };
  },
) {
  tx.create(db.collection(COL.history).doc(), {
    submissionId: h.submissionId,
    vendorId: h.vendorId,
    category: h.category,
    previousStatus: h.previousStatus,
    newStatus: h.newStatus,
    remarks: h.remarks,
    versionNumber: h.version,
    updatedBy: h.by.uid,
    updatedByName: h.by.name,
    updatedByRole: h.by.role,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Category staff may act only on their own categories. */
function assertCategoryAccess(caller: Caller, category: Category) {
  if (caller.kind === 'STAFF' && caller.role === 'CATEGORY' && !caller.categories.includes(category)) {
    throw denied(`You are not assigned to the ${CATEGORY_LABELS[category]} category.`);
  }
}

/**
 * Create a POD submission. Files must already be uploaded to
 *   pod-documents/{vendorId}/{submissionId}/version-1/
 * Vendors upload for themselves; Category/Admin staff upload on a vendor's behalf.
 */
export const createPodSubmission = onCall(async (req) => {
  const caller = await requireCaller(req, ['ADMIN', 'CATEGORY']);
  const input = parse(schemas.createSubmission, req.data);
  const by = who(caller);

  const vendorId = caller.kind === 'VENDOR' ? caller.vendorId : input.vendorId;
  if (!vendorId) throw invalid('Please select the vendor.', { vendorId: 'Select the vendor' });
  if (caller.kind === 'VENDOR' && input.forwardNow) throw denied('Vendors cannot forward PODs to billing.');

  const vendorSnap = await db.collection(COL.vendors).doc(vendorId).get();
  if (!vendorSnap.exists) throw notFound('Vendor not found.');
  const vendor = vendorSnap.data()!;
  if (vendor.accountStatus === 'DEACTIVATED') throw conflict('This vendor is deactivated.');
  const vendorCategories = (vendor.categories as Category[] | undefined) ?? [];
  if (!vendorCategories.includes(input.category)) {
    throw invalid(`${vendor.vendorName} is not registered for the ${CATEGORY_LABELS[input.category]} category.`, { category: 'Select one of the vendor’s categories' });
  }
  assertCategoryAccess(caller, input.category);

  const subRef = db.collection(COL.submissions).doc(input.submissionId);
  if ((await subRef.get()).exists) throw alreadyExists('This submission already exists.'); // never touch existing files
  const files = await verifyVersionFolder(vendorId, input.submissionId, 1);
  const forward = caller.kind === 'STAFF' && !!input.forwardNow;

  try {
    const submissionNumber = await db.runTransaction(async (tx) => {
      const invoiceKey = uniqueKey.invoice(vendorId, input.invoiceNumber);
      const [counter, existing, dup] = await Promise.all([tx.get(COUNTER()), tx.get(subRef), tx.get(invoiceKey)]);
      if (existing.exists) throw alreadyExists('This submission already exists.');
      if (dup.exists) {
        throw alreadyExists(`A POD has already been uploaded for invoice ${input.invoiceNumber}. If it was sent back, use Re-upload on that submission.`);
      }
      const next = (counter.exists ? (counter.get('next') as number) : FIRST_NUMBER) || FIRST_NUMBER;
      const number = `POD-${next}`;
      const now = FieldValue.serverTimestamp();
      tx.set(COUNTER(), { next: next + 1 }, { merge: true });
      tx.create(invoiceKey, { kind: 'invoice', submissionId: subRef.id });
      tx.create(subRef, {
        submissionNumber: number,
        vendorId,
        vendorName: vendor.vendorName,
        vendorCode: vendor.vendorCode,
        category: input.category,
        poNumber: input.poNumber,
        invoiceNumber: input.invoiceNumber,
        deliveryDate: input.deliveryDate,
        deliveryReference: input.deliveryReference,
        uploadedBy: by.uid,
        uploadedByName: by.name,
        uploadedByRole: by.role,
        submittedAt: now,
        currentStatus: forward ? 'FORWARDED_TO_BILLING' : 'SUBMITTED',
        currentVersion: 1,
        billingVisible: forward,
        forwardedAt: forward ? now : null,
        billedAt: null,
        lastRemarks: null,
        lastActionBy: by.uid,
        lastActionByName: by.name,
        lastActionByRole: by.role,
        lastActionAt: now,
        createdAt: now,
        updatedAt: now,
        searchKeywords: keywords({ ...input, submissionNumber: number, vendorName: vendor.vendorName, vendorCode: vendor.vendorCode }),
      });
      writeDocuments(tx, files, { submissionId: subRef.id, vendorId, category: input.category, version: 1, uid: by.uid, role: by.role });
      writeHistory(tx, {
        submissionId: subRef.id, vendorId, category: input.category, previousStatus: null, newStatus: 'SUBMITTED',
        remarks: caller.kind === 'VENDOR' ? 'POD uploaded by vendor' : `POD uploaded by ${by.role === 'ADMIN' ? 'Admin' : 'Category team'} on behalf of vendor`,
        version: 1, by,
      });
      if (forward) {
        writeHistory(tx, { submissionId: subRef.id, vendorId, category: input.category, previousStatus: 'SUBMITTED', newStatus: 'FORWARDED_TO_BILLING', remarks: 'Forwarded to billing', version: 1, by });
      }
      return number;
    });

    const sLink = `/admin/submissions/${subRef.id}`;
    const vLink = `/vendor/submissions/${subRef.id}`;
    const label = `${submissionNumber} (${vendor.vendorName}, ${CATEGORY_LABELS[input.category]}, Invoice ${input.invoiceNumber})`;
    await Promise.all([
      // RCPL staff: category team of this category + all admins (+ billing if forwarded now)
      notify(
        { categories: [input.category], admins: true, billing: forward },
        caller.kind === 'VENDOR'
          ? { title: 'New POD received', message: `${label} was uploaded by the vendor and is waiting for review.`, link: sLink }
          : forward
            ? { title: 'POD ready for billing', message: `${label} was uploaded by ${by.name} and forwarded to billing.`, link: sLink }
            : { title: 'New POD uploaded', message: `${label} was uploaded by ${by.name} on behalf of the vendor.`, link: sLink },
        { exceptUid: by.uid },
      ),
      // Vendor: confirmation, or "uploaded for you"
      notify(
        { vendorId },
        caller.kind === 'VENDOR'
          ? { title: 'POD submitted', message: `${submissionNumber} (Invoice ${input.invoiceNumber}) was submitted to the RCPL ${CATEGORY_LABELS[input.category]} team.`, link: vLink }
          : { title: 'POD uploaded for you', message: `RCPL uploaded the POD for invoice ${input.invoiceNumber} (${submissionNumber}).`, link: vLink },
      ),
    ]);
    return { submissionId: subRef.id, submissionNumber, status: forward ? 'FORWARDED_TO_BILLING' : 'SUBMITTED' };
  } catch (err) {
    await deleteVersionFolder(vendorId, input.submissionId, 1);
    throw err;
  }
});

/**
 * Re-upload after "Send back" — by the vendor or the category team (or admin).
 * Files go to version-{n+1}; earlier versions are never overwritten.
 */
export const resubmitPodSubmission = onCall(async (req) => {
  const caller = await requireCaller(req, ['ADMIN', 'CATEGORY']);
  const input = parse(schemas.resubmit, req.data);
  const by = who(caller);
  const subRef = db.collection(COL.submissions).doc(input.submissionId);
  const snap = await subRef.get();
  if (!snap.exists) throw notFound('Submission not found.');
  const vendorId = snap.get('vendorId') as string;
  const category = snap.get('category') as Category;
  if (caller.kind === 'VENDOR' && caller.vendorId !== vendorId) throw notFound('Submission not found.');
  assertCategoryAccess(caller, category);
  if (snap.get('currentStatus') !== 'RESUBMISSION_REQUESTED') throw conflict('A new POD can only be uploaded after it has been sent back.');
  const version = (snap.get('currentVersion') as number) + 1;
  const files = await verifyVersionFolder(vendorId, subRef.id, version);

  try {
    const s = await db.runTransaction(async (tx) => {
      const cur = await tx.get(subRef);
      if (cur.get('currentStatus') !== 'RESUBMISSION_REQUESTED' || cur.get('currentVersion') !== version - 1) {
        throw conflict('This submission was changed by someone else. Please refresh and try again.');
      }
      const s = cur.data()!;
      const invoiceNumber = input.invoiceNumber ?? s.invoiceNumber;
      if (invoiceNumber.trim().toLowerCase() !== String(s.invoiceNumber).trim().toLowerCase()) {
        const newKey = uniqueKey.invoice(vendorId, invoiceNumber);
        if ((await tx.get(newKey)).exists) throw alreadyExists(`A POD has already been uploaded for invoice ${invoiceNumber}.`);
        tx.delete(uniqueKey.invoice(vendorId, s.invoiceNumber));
        tx.create(newKey, { kind: 'invoice', submissionId: subRef.id });
      }
      const updated = {
        poNumber: input.poNumber ?? s.poNumber,
        invoiceNumber,
        deliveryDate: input.deliveryDate ?? s.deliveryDate,
        deliveryReference: input.deliveryReference !== undefined ? input.deliveryReference : s.deliveryReference,
      };
      const now = FieldValue.serverTimestamp();
      tx.update(subRef, {
        ...updated,
        currentStatus: 'SUBMITTED',
        currentVersion: version,
        lastActionBy: by.uid,
        lastActionByName: by.name,
        lastActionByRole: by.role,
        lastActionAt: now,
        updatedAt: now,
        searchKeywords: keywords({ ...updated, submissionNumber: s.submissionNumber, vendorName: s.vendorName, vendorCode: s.vendorCode }),
      });
      writeDocuments(tx, files, { submissionId: subRef.id, vendorId, category, version, uid: by.uid, role: by.role });
      writeHistory(tx, {
        submissionId: subRef.id, vendorId, category, previousStatus: 'RESUBMISSION_REQUESTED', newStatus: 'SUBMITTED',
        remarks: `New POD copy uploaded (version ${version})${input.note ? `: ${input.note}` : ''}`, version, by,
      });
      return s;
    });

    await Promise.all([
      notify(
        { categories: [category], admins: true },
        { title: 'New POD copy received', message: `${s.submissionNumber} (${s.vendorName}, Invoice ${s.invoiceNumber}) — version ${version} uploaded by ${by.name}, waiting for review.`, link: `/admin/submissions/${subRef.id}` },
        { exceptUid: by.uid },
      ),
      caller.kind === 'STAFF'
        ? notify({ vendorId }, { title: 'New POD copy uploaded', message: `RCPL uploaded a new copy for ${s.submissionNumber} (version ${version}).`, link: `/vendor/submissions/${subRef.id}` })
        : Promise.resolve(),
    ]);
    return { submissionId: subRef.id, version, status: 'SUBMITTED' };
  } catch (err) {
    await deleteVersionFolder(vendorId, subRef.id, version);
    throw err;
  }
});

/**
 * Status actions by RCPL staff:
 *   FORWARD      SUBMITTED → FORWARDED_TO_BILLING            (Category, Admin)
 *   SEND_BACK    SUBMITTED → RESUBMISSION_REQUESTED          (Category, Admin)
 *                FORWARDED_TO_BILLING → RESUBMISSION_REQUESTED (Billing, Admin)
 *   MARK_BILLED  FORWARDED_TO_BILLING → BILLED               (Billing, Admin)
 */
export const updatePodStatus = onCall(async (req) => {
  const staff = await requireStaff(req, ['ADMIN', 'CATEGORY', 'BILLING']);
  const { submissionId, action, remarks } = parse(schemas.podAction, req.data);
  const caller: Caller = { kind: 'STAFF', ...staff };
  const by = who(caller);
  const subRef = db.collection(COL.submissions).doc(submissionId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(subRef);
    if (!snap.exists) throw notFound('Submission not found.');
    const s = snap.data()!;
    const status = s.currentStatus as PodStatus;
    const category = s.category as Category;

    let next: PodStatus;
    if (action === 'FORWARD') {
      if (!['ADMIN', 'CATEGORY'].includes(staff.role)) throw denied('Only the category team can forward PODs to billing.');
      if (status !== 'SUBMITTED') throw conflict('Only PODs that are with the category team can be forwarded.');
      next = 'FORWARDED_TO_BILLING';
    } else if (action === 'MARK_BILLED') {
      if (!['ADMIN', 'BILLING'].includes(staff.role)) throw denied('Only the billing team can mark PODs as billed.');
      if (status !== 'FORWARDED_TO_BILLING') throw conflict('Only PODs that are with billing can be marked as billed.');
      next = 'BILLED';
    } else {
      const allowed =
        (status === 'SUBMITTED' && ['ADMIN', 'CATEGORY'].includes(staff.role)) ||
        (status === 'FORWARDED_TO_BILLING' && ['ADMIN', 'BILLING'].includes(staff.role));
      if (!allowed) throw conflict('This POD cannot be sent back at its current stage by your team.');
      next = 'RESUBMISSION_REQUESTED';
    }
    if (staff.role === 'CATEGORY') assertCategoryAccess(caller, category);
    if (staff.role === 'BILLING' && !s.billingVisible) throw notFound('Submission not found.');

    const now = FieldValue.serverTimestamp();
    tx.update(subRef, {
      currentStatus: next,
      ...(next === 'FORWARDED_TO_BILLING' ? { billingVisible: true, forwardedAt: now } : {}),
      ...(next === 'BILLED' ? { billedAt: now } : {}),
      ...(next === 'RESUBMISSION_REQUESTED' ? { lastRemarks: remarks } : {}),
      lastActionBy: by.uid,
      lastActionByName: by.name,
      lastActionByRole: by.role,
      lastActionAt: now,
      updatedAt: now,
    });
    writeHistory(tx, {
      submissionId, vendorId: s.vendorId, category, previousStatus: status, newStatus: next,
      remarks: remarks ?? (next === 'FORWARDED_TO_BILLING' ? 'Forwarded to billing' : next === 'BILLED' ? 'Marked as billed' : null),
      version: s.currentVersion, by,
    });
    return { s, next };
  });

  const { s, next } = result;
  const label = `${s.submissionNumber} (${s.vendorName}, ${CATEGORY_LABELS[s.category as Category]}, Invoice ${s.invoiceNumber})`;
  const vLink = `/vendor/submissions/${submissionId}`;
  const sLink = `/admin/submissions/${submissionId}`;
  const ex = { exceptUid: by.uid };
  if (next === 'FORWARDED_TO_BILLING') {
    await Promise.all([
      notify({ billing: true, admins: true }, { title: 'POD forwarded to billing', message: `${label} was forwarded to billing by ${by.name}.${remarks ? ` Note: ${remarks}` : ''}`, link: sLink }, ex),
      notify({ vendorId: s.vendorId }, { title: 'POD with billing', message: `${s.submissionNumber} (Invoice ${s.invoiceNumber}) has been forwarded to the RCPL billing team.`, link: vLink }, { email: false }),
    ]);
  } else if (next === 'BILLED') {
    await Promise.all([
      notify({ categories: [s.category], admins: true }, { title: 'POD billed', message: `${label} has been marked as billed by ${by.name}.${remarks ? ` Note: ${remarks}` : ''}`, link: sLink }, ex),
      notify({ vendorId: s.vendorId }, { title: 'Billing completed', message: `${s.submissionNumber} (Invoice ${s.invoiceNumber}) has been processed by RCPL billing.`, link: vLink }),
    ]);
  } else {
    await Promise.all([
      notify({ vendorId: s.vendorId }, { title: 'New POD copy requested', message: `${s.submissionNumber} (Invoice ${s.invoiceNumber}): ${remarks}. Please upload a corrected POD copy.`, link: `${vLink}?reupload=1` }),
      notify({ categories: [s.category], admins: true }, { title: 'POD sent back', message: `${label} was sent back by ${by.name}: ${remarks}`, link: sLink }, ex),
    ]);
  }
  return { submissionId, status: next };
});
