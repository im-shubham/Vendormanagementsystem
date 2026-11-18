/**
 * End-to-end workflow + security test against the Firebase Emulator Suite.
 * Uses the real web SDK (so Firestore/Storage security rules apply exactly as
 * in the browser) and the real Cloud Functions running in the emulator.
 *
 *   npm test        (root — builds functions and runs inside emulators:exec)
 *
 * Each run uses unique vendors, so it can be repeated on the same emulator.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  confirmPasswordReset, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getCountFromServer, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getBytes, getStorage, ref, uploadBytes } from 'firebase/storage';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-rcpl-pod';
const REGION = 'asia-south1';
const ADMIN = { email: 'admin@rcpl.demo', password: 'Admin@12345' };
const run = Date.now().toString(36).toUpperCase();
const password = 'Vendor@123';

// ---------------------------------------------------------------------
let passed = 0;
const failures: string[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.info(`  ✔ ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`  ✘ ${name}\n      ${(err as Error).stack?.split('\n').slice(0, 3).join('\n      ')}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function expectError(p: Promise<unknown>, match: (e: any) => boolean, label: string) {
  try {
    await p;
  } catch (e: any) {
    if (match(e)) return e;
    throw new Error(`${label}: unexpected error ${e?.code} ${e?.message} ${JSON.stringify(e?.details)}`);
  }
  throw new Error(`${label}: expected an error but the call succeeded`);
}
const denied = (e: any) => e?.code === 'permission-denied' || e?.code === 'storage/unauthorized' || e?.code === 'functions/permission-denied';
const appCode = (code: string) => (e: any) => e?.details?.code === code;

// ---------------------------------------------------------------------
const apps: FirebaseApp[] = [];
function client(name: string) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', storageBucket: `${PROJECT}.appspot.com` }, `${name}-${run}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  const fns = getFunctions(app, REGION);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const call = <T = any>(fn: string, data?: unknown) => httpsCallable<unknown, T>(fns, fn)(data).then((r) => r.data);
  return { app, auth, db, storage, call };
}
type Client = ReturnType<typeof client>;

const PDF = (label: string) => new TextEncoder().encode(`%PDF-1.4\n% dummy POD ${label}\n%%EOF`);
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

async function claims(c: Client) {
  const t = await c.auth.currentUser!.getIdTokenResult(true);
  return t.claims as { role?: string; vendorId?: string };
}

async function upload(c: Client, vendorId: string, submissionId: string, version: number, file: string, bytes: Uint8Array, contentType: string) {
  const path = `pod-documents/${vendorId}/${submissionId}/version-${version}/${file}`;
  await uploadBytes(ref(c.storage, path), bytes, { contentType, customMetadata: { originalName: `original-${file}` } });
  return path;
}

async function main() {
  console.info(`E2E run ${run} (project ${PROJECT})\n`);
  const admin = client('admin');
  const vA = client('vendorA');
  const vB = client('vendorB');
  const attacker = client('attacker');

  const today = new Date().toISOString().slice(0, 10);
  const vendorA = { vendorCode: `E2EA${run}`.slice(0, 30), vendorName: `E2E Alpha Foods ${run}`, email: `alpha.${run.toLowerCase()}@example.com`, contactPerson: 'Test Contact', mobileNumber: '+91 98765 43210', address: '1 Test Street, Mumbai' };
  const vendorB = { ...vendorA, vendorCode: `E2EB${run}`.slice(0, 30), vendorName: `E2E Beta Agro ${run}`, email: `beta.${run.toLowerCase()}@example.com` };
  let vendorAId = '';
  let vendorBId = '';
  let regId = '';
  let sub1 = '';
  let sub2 = '';

  console.info('Phase 1 — onboarding');
  await step('Admin logs in and has the server-set ADMIN claim', async () => {
    await signInWithEmailAndPassword(admin.auth, ADMIN.email, ADMIN.password);
    assert((await claims(admin)).role === 'ADMIN', 'missing ADMIN claim');
  });

  await step('1. Admin creates vendor records (duplicates refused)', async () => {
    vendorAId = (await admin.call<{ vendorId: string }>('createVendor', vendorA)).vendorId;
    const v = await getDoc(doc(admin.db, 'vendors', vendorAId));
    assert(v.get('accountStatus') === 'NOT_REGISTERED', 'status should be NOT_REGISTERED');
    await expectError(admin.call('createVendor', vendorA), (e) => e.code === 'functions/already-exists', 'duplicate vendor code');
    await expectError(admin.call('createVendor', { ...vendorA, vendorCode: 'OTHER' + run }), (e) => e.code === 'functions/already-exists', 'duplicate email');
    vendorBId = (await admin.call<{ vendorId: string }>('createVendor', vendorB)).vendorId;
  });

  await step('Non-admins cannot call admin functions or write Firestore directly', async () => {
    await expectError(attacker.call('createVendor', vendorA), (e) => e.code === 'functions/unauthenticated', 'anonymous createVendor');
    await createUserWithEmailAndPassword(attacker.auth, `attacker.${run.toLowerCase()}@example.com`, 'Attack@123');
    await expectError(attacker.call('createVendor', { ...vendorA, vendorCode: 'HACK' + run }), denied, 'self-signed-up user createVendor');
    await expectError(getDocs(collection(attacker.db, 'vendors')), denied, 'self-signed-up user reads vendors');
    await expectError(setDoc(doc(attacker.db, 'vendors', 'x'), { accountStatus: 'ACTIVE' }), denied, 'direct vendor write');
  });

  await step('Activation rejects unknown email / wrong code / weak password', async () => {
    await expectError(vA.call('activateVendorAccount', { email: 'random@example.com', vendorCode: vendorA.vendorCode, password, confirmPassword: password }), appCode('VALIDATION'), 'unknown email');
    await expectError(vA.call('activateVendorAccount', { email: vendorA.email, vendorCode: 'WRONG1', password, confirmPassword: password }), appCode('VALIDATION'), 'wrong code');
    await expectError(vA.call('activateVendorAccount', { email: vendorA.email, vendorCode: vendorA.vendorCode, password: 'short', confirmPassword: 'short' }), appCode('VALIDATION'), 'weak password');
  });

  await step('2. Vendor creates a password (first-time activation); second attempt refused', async () => {
    const r = await vA.call<{ status: string }>('activateVendorAccount', { email: vendorA.email.toUpperCase(), vendorCode: vendorA.vendorCode.toLowerCase(), password, confirmPassword: password });
    assert(r.status === 'PENDING_APPROVAL', 'should be pending');
    await expectError(vA.call('activateVendorAccount', { email: vendorA.email, vendorCode: vendorA.vendorCode, password, confirmPassword: password }), appCode('ALREADY_ACTIVATED'), 'second activation');
  });

  await step('3. Account is PENDING_APPROVAL with a registration request', async () => {
    const v = await getDoc(doc(admin.db, 'vendors', vendorAId));
    assert(v.get('accountStatus') === 'PENDING_APPROVAL', `status ${v.get('accountStatus')}`);
    const regs = await getDocs(query(collection(admin.db, 'vendorRegistrationRequests'), where('vendorId', '==', vendorAId), where('approvalStatus', '==', 'PENDING')));
    assert(regs.size === 1, 'registration request missing');
    regId = regs.docs[0].id;
  });

  await step('4. Pending vendor cannot access data, upload, or call vendor functions', async () => {
    await signInWithEmailAndPassword(vA.auth, vendorA.email, password);
    const c = await claims(vA);
    assert(c.role === 'VENDOR' && c.vendorId === vendorAId, 'vendor claims');
    const own = await getDoc(doc(vA.db, 'vendors', vendorAId)); // allowed: own record, to show status
    assert(own.get('accountStatus') === 'PENDING_APPROVAL', 'own status readable');
    await expectError(getDocs(query(collection(vA.db, 'podSubmissions'), where('vendorId', '==', vendorAId))), denied, 'pending reads submissions');
    await expectError(upload(vA, vendorAId, 'pendingSub0000001', 1, 'pod-document.pdf', PDF('x'), 'application/pdf'), denied, 'pending upload');
    await expectError(vA.call('createPodSubmission', { submissionId: 'pendingSub0000001', poNumber: 'P', invoiceNumber: 'I', deliveryDate: today }), appCode('ACCOUNT_PENDING'), 'pending createPodSubmission');
    await expectError(updateDoc(doc(vA.db, 'vendors', vendorAId), { accountStatus: 'ACTIVE' }), denied, 'vendor self-approval');
  });

  await step('5. Admin approves the vendor', async () => {
    const r = await admin.call<{ accountStatus: string }>('reviewVendorRegistration', { requestId: regId, decision: 'APPROVED' });
    assert(r.accountStatus === 'ACTIVE', 'approve');
    await expectError(admin.call('reviewVendorRegistration', { requestId: regId, decision: 'APPROVED' }), (e) => e.code === 'functions/failed-precondition', 'double approval');
  });

  await step('6. Vendor can now read its data (same session, no re-login needed)', async () => {
    const n = await getCountFromServer(query(collection(vA.db, 'podSubmissions'), where('vendorId', '==', vendorAId)));
    assert(n.data().count === 0, 'empty');
    await expectError(getDocs(collection(vA.db, 'podSubmissions')), denied, 'unscoped query must be refused');
  });

  console.info('\nPhase 2 — POD upload');
  await step('Upload rules: wrong folder, wrong type, oversize name, overwrite all refused', async () => {
    await expectError(upload(vA, vendorBId, 'subX000000000001', 1, 'pod-document.pdf', PDF('x'), 'application/pdf'), denied, 'other vendor folder');
    await expectError(upload(vA, vendorAId, 'subX000000000001', 1, 'evil.exe', PDF('x'), 'application/octet-stream'), denied, 'bad file name/type');
    await expectError(upload(vA, vendorAId, 'subX000000000001', 1, 'pod-document.pdf', PDF('x'), 'text/plain'), denied, 'bad content type');
    await upload(vA, vendorAId, 'subX000000000001', 1, 'pod-document.pdf', PDF('x'), 'application/pdf');
    await expectError(upload(vA, vendorAId, 'subX000000000001', 1, 'pod-document.pdf', PDF('y'), 'application/pdf'), denied, 'overwrite');
  });

  await step('Function validation: missing file, fake PDF, future date', async () => {
    const empty = doc(collection(vA.db, 'podSubmissions')).id;
    await expectError(vA.call('createPodSubmission', { submissionId: empty, poNumber: 'P1', invoiceNumber: 'I1', deliveryDate: today }), appCode('VALIDATION'), 'no file');
    const fake = doc(collection(vA.db, 'podSubmissions')).id;
    await upload(vA, vendorAId, fake, 1, 'pod-document.pdf', new TextEncoder().encode('not a pdf'), 'application/pdf');
    await expectError(vA.call('createPodSubmission', { submissionId: fake, poNumber: 'P1', invoiceNumber: 'I1', deliveryDate: today }), appCode('VALIDATION'), 'fake pdf');
    await expectError(vA.call('createPodSubmission', { submissionId: fake, poNumber: 'P1', invoiceNumber: 'I1', deliveryDate: '2999-01-01' }), appCode('VALIDATION'), 'future date');
  });

  await step('7. Vendor uploads a POD + photo → UNDER_REVIEW with unique number', async () => {
    sub1 = doc(collection(vA.db, 'podSubmissions')).id;
    await upload(vA, vendorAId, sub1, 1, 'pod-document.pdf', PDF('one'), 'application/pdf');
    await upload(vA, vendorAId, sub1, 1, 'supporting-photo.png', PNG, 'image/png');
    const r = await vA.call<{ submissionNumber: string; status: string }>('createPodSubmission', { submissionId: sub1, poNumber: `PO-${run}-1`, invoiceNumber: `INV-${run}-1`, deliveryDate: today, deliveryReference: 'LR-001' });
    assert(/^POD-\d{5,}$/.test(r.submissionNumber) && r.status === 'UNDER_REVIEW', JSON.stringify(r));
    const s = await getDoc(doc(vA.db, 'podSubmissions', sub1));
    assert(s.get('currentStatus') === 'UNDER_REVIEW' && s.get('vendorId') === vendorAId, 'stored');
    const docs = await getDocs(query(collection(vA.db, 'podDocuments'), where('vendorId', '==', vendorAId), where('submissionId', '==', sub1)));
    assert(docs.size === 2, `expected 2 documents, got ${docs.size}`);
    assert(docs.docs.some((d) => d.get('fileName') === 'original-pod-document.pdf'), 'original filename kept');
    // duplicate invoice
    const dup = doc(collection(vA.db, 'podSubmissions')).id;
    await upload(vA, vendorAId, dup, 1, 'pod-document.pdf', PDF('dup'), 'application/pdf');
    await expectError(vA.call('createPodSubmission', { submissionId: dup, poNumber: 'X', invoiceNumber: `inv-${run}-1`, deliveryDate: today }), (e) => e.code === 'functions/already-exists', 'duplicate invoice');
    await expectError(vA.call('createPodSubmission', { submissionId: sub1, poNumber: 'X', invoiceNumber: 'NEW', deliveryDate: today }), (e) => e.code === 'functions/already-exists', 'reuse of submission id');
    const notes = await getDocs(query(collection(vA.db, 'notifications'), where('userId', '==', vA.auth.currentUser!.uid)));
    assert(notes.docs.some((n) => n.get('title') === 'POD submitted'), 'submission notification');
  });

  await step('Vendor isolation: another vendor cannot read A’s records or files', async () => {
    await vB.call('activateVendorAccount', { email: vendorB.email, vendorCode: vendorB.vendorCode, password, confirmPassword: password });
    const regs = await getDocs(query(collection(admin.db, 'vendorRegistrationRequests'), where('vendorId', '==', vendorBId), where('approvalStatus', '==', 'PENDING')));
    await admin.call('reviewVendorRegistration', { requestId: regs.docs[0].id, decision: 'APPROVED' });
    await signInWithEmailAndPassword(vB.auth, vendorB.email, password);
    await expectError(getDoc(doc(vB.db, 'podSubmissions', sub1)), denied, 'B reads A submission');
    await expectError(getDocs(query(collection(vB.db, 'podSubmissions'), where('vendorId', '==', vendorAId))), denied, 'B queries A');
    await expectError(getDoc(doc(vB.db, 'vendors', vendorAId)), denied, 'B reads A vendor record');
    await expectError(getBytes(ref(vB.storage, `pod-documents/${vendorAId}/${sub1}/version-1/pod-document.pdf`)), denied, 'B downloads A file');
    await expectError(vB.call('resubmitPodSubmission', { submissionId: sub1 }), (e) => e.code === 'functions/not-found', 'B resubmits A');
    await expectError(vB.call('reviewPodSubmission', { submissionId: sub1, decision: 'APPROVED' }), denied, 'vendor reviews');
  });

  console.info('\nPhase 3 — admin review');
  await step('8. Admin views the POD and downloads the file', async () => {
    const s = await getDoc(doc(admin.db, 'podSubmissions', sub1));
    assert(s.exists(), 'admin sees submission');
    const docs = await getDocs(query(collection(admin.db, 'podDocuments'), where('submissionId', '==', sub1)));
    const pod = docs.docs.find((d) => d.get('documentType') === 'POD')!;
    const bytes = await getBytes(ref(admin.storage, pod.get('storagePath')));
    assert(new TextDecoder().decode(bytes).includes('dummy POD one'), 'content');
    const list = await getDocs(query(collection(admin.db, 'podSubmissions'), where('searchKeywords', 'array-contains', `po-${run.toLowerCase()}-1`.slice(0, 30))));
    assert(list.docs.some((d) => d.id === sub1), 'search by PO');
  });

  await step('9. Admin approves the POD (cannot review twice)', async () => {
    await admin.call('reviewPodSubmission', { submissionId: sub1, decision: 'APPROVED' });
    await expectError(admin.call('reviewPodSubmission', { submissionId: sub1, decision: 'REJECTED', remarks: 'x' }), (e) => e.code === 'functions/failed-precondition', 'review twice');
  });

  await step('10. Vendor sees APPROVED + notification; dashboard counts from data', async () => {
    const s = await getDoc(doc(vA.db, 'podSubmissions', sub1));
    assert(s.get('currentStatus') === 'APPROVED', 'approved');
    const notes = await getDocs(query(collection(vA.db, 'notifications'), where('userId', '==', vA.auth.currentUser!.uid)));
    assert(notes.docs.some((n) => n.get('title') === 'POD approved'), 'approval notification');
    const approved = await getCountFromServer(query(collection(vA.db, 'podSubmissions'), where('vendorId', '==', vendorAId), where('currentStatus', '==', 'APPROVED')));
    assert(approved.data().count === 1, 'count');
  });

  await step('11. Admin rejects another POD — remarks mandatory', async () => {
    sub2 = doc(collection(vA.db, 'podSubmissions')).id;
    await upload(vA, vendorAId, sub2, 1, 'pod-document.png', PNG, 'image/png');
    await vA.call('createPodSubmission', { submissionId: sub2, poNumber: `PO-${run}-2`, invoiceNumber: `INV-${run}-2`, deliveryDate: today });
    await expectError(admin.call('reviewPodSubmission', { submissionId: sub2, decision: 'REJECTED', remarks: '  ' }), appCode('VALIDATION'), 'no remarks');
    await expectError(vA.call('resubmitPodSubmission', { submissionId: sub2 }), (e) => e.code === 'functions/failed-precondition', 'resubmit while under review');
    await admin.call('reviewPodSubmission', { submissionId: sub2, decision: 'REJECTED', remarks: 'Receiving stamp not visible' });
  });

  await step('12. Vendor sees the reason and re-uploads (version 2)', async () => {
    const s = await getDoc(doc(vA.db, 'podSubmissions', sub2));
    assert(s.get('adminRemarks') === 'Receiving stamp not visible', 'remarks visible');
    const notes = await getDocs(query(collection(vA.db, 'notifications'), where('userId', '==', vA.auth.currentUser!.uid)));
    const n = notes.docs.find((d) => String(d.get('message')).includes('Receiving stamp not visible'));
    assert(n, 'rejection notification with remarks');
    await updateDoc(n!.ref, { isRead: true });
    await expectError(updateDoc(n!.ref, { title: 'hacked' }), denied, 'notification edit beyond isRead');
    await upload(vA, vendorAId, sub2, 2, 'pod-document.pdf', PDF('two-v2'), 'application/pdf');
    const r = await vA.call<{ version: number; status: string }>('resubmitPodSubmission', { submissionId: sub2, note: 'Clear scan with stamp' });
    assert(r.version === 2 && r.status === 'UNDER_REVIEW', JSON.stringify(r));
  });

  await step('13. Admin reviews v2 — v1 preserved, history complete', async () => {
    const docs = await getDocs(query(collection(admin.db, 'podDocuments'), where('submissionId', '==', sub2)));
    const versions = docs.docs.map((d) => d.get('versionNumber')).sort();
    assert(JSON.stringify(versions) === '[1,2]', `versions ${versions}`);
    const hist = await getDocs(query(collection(admin.db, 'podStatusHistory'), where('submissionId', '==', sub2)));
    const seq = hist.docs.map((d) => d.data()).sort((a, b) => a.updatedAt.toMillis() - b.updatedAt.toMillis()).map((h) => h.newStatus);
    assert(JSON.stringify(seq) === JSON.stringify(['UNDER_REVIEW', 'REJECTED', 'UNDER_REVIEW']), `history ${seq}`);
    await admin.call('reviewPodSubmission', { submissionId: sub2, decision: 'APPROVED', remarks: 'Verified' });
  });

  console.info('\nVendor management');
  await step('Admin edits vendor; email locked after activation', async () => {
    await admin.call('updateVendor', { vendorId: vendorAId, ...vendorA, contactPerson: 'Updated Contact' });
    const v = await getDoc(doc(admin.db, 'vendors', vendorAId));
    assert(v.get('contactPerson') === 'Updated Contact', 'edit');
    await expectError(admin.call('updateVendor', { vendorId: vendorAId, ...vendorA, email: 'new@example.com' }), appCode('VALIDATION'), 'email change');
    const found = await getDocs(query(collection(admin.db, 'vendors'), where('searchKeywords', 'array-contains', 'e2e alpha')));
    assert(found.docs.some((d) => d.id === vendorAId), 'search vendors');
  });

  await step('Deactivation blocks immediately (rules + disabled login); history kept; reactivation works', async () => {
    await admin.call('deactivateVendor', { vendorId: vendorBId });
    await expectError(getDocs(query(collection(vB.db, 'podSubmissions'), where('vendorId', '==', vendorBId))), denied, 'existing session blocked');
    const fresh = client('vendorB2');
    await expectError(signInWithEmailAndPassword(fresh.auth, vendorB.email, password), (e) => e.code === 'auth/user-disabled', 'disabled login');
    await admin.call('reactivateVendor', { vendorId: vendorBId });
    await signInWithEmailAndPassword(fresh.auth, vendorB.email, password);
    const total = await getCountFromServer(query(collection(admin.db, 'podSubmissions'), where('vendorId', '==', vendorAId)));
    assert(total.data().count === 2, 'history intact');
  });

  await step('Registration rejection → vendor sees REJECTED and has no data access', async () => {
    const vc = { ...vendorA, vendorCode: `E2EC${run}`.slice(0, 30), vendorName: `E2E Gamma ${run}`, email: `gamma.${run.toLowerCase()}@example.com` };
    const id = (await admin.call<{ vendorId: string }>('createVendor', vc)).vendorId;
    const c = client('vendorC');
    await c.call('activateVendorAccount', { email: vc.email, vendorCode: vc.vendorCode, password, confirmPassword: password });
    const regs = await getDocs(query(collection(admin.db, 'vendorRegistrationRequests'), where('vendorId', '==', id)));
    await admin.call('reviewVendorRegistration', { requestId: regs.docs[0].id, decision: 'REJECTED', remarks: 'Unknown vendor' });
    await signInWithEmailAndPassword(c.auth, vc.email, password);
    assert((await getDoc(doc(c.db, 'vendors', id))).get('accountStatus') === 'REJECTED', 'rejected status');
    await expectError(c.call('createPodSubmission', { submissionId: 'abcdefghij12345', poNumber: 'P', invoiceNumber: 'I', deliveryDate: today }), appCode('ACCOUNT_REJECTED'), 'rejected vendor call');
  });

  await step('Password reset (Firebase Auth email link flow)', async () => {
    const c = client('reset');
    await sendPasswordResetEmail(c.auth, vendorA.email);
    const res = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`);
    const { oobCodes } = (await res.json()) as { oobCodes: Array<{ email: string; requestType: string; oobCode: string }> };
    const code = oobCodes.filter((o) => o.email === vendorA.email && o.requestType === 'PASSWORD_RESET').pop();
    assert(code, 'reset code issued');
    await confirmPasswordReset(c.auth, code!.oobCode, 'NewPass@456');
    await signInWithEmailAndPassword(c.auth, vendorA.email, 'NewPass@456');
  });

  console.info(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('Failed:\n - ' + failures.join('\n - '));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(apps.map((a) => deleteApp(a).catch(() => undefined)));
    setTimeout(() => process.exit(process.exitCode ?? 0), 200);
  });
