/**
 * End-to-end workflow + security test against the Firebase Emulator Suite.
 * Uses the real web SDK (so Firestore/Storage security rules apply exactly as
 * in the browser) and the real Cloud Functions running in the emulator.
 *
 *   npm test        (root — builds functions and runs inside emulators:exec)
 *
 * Roles: Admin · Category team (per category) · Billing team · Vendor.
 * Each run uses unique users, so it can be repeated on the same emulator.
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
import { getApps as adminApps, initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

/** Admin SDK (emulator) — only to inspect the server-only `mail` queue. */
const adminDb = () => {
  if (!adminApps().length) adminInit({ projectId: process.env.GCLOUD_PROJECT || 'demo-rcpl-pod' });
  return adminFirestore();
};

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-rcpl-pod';
const REGION = 'asia-south1';
const ADMIN = { email: 'admin@rcpl.demo', password: 'Admin@12345' };
const run = Date.now().toString(36).toUpperCase();
const lc = run.toLowerCase();
const password = 'Vendor@123';
const staffPassword = 'Staff@1234';

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
const fnCode = (code: string) => (e: any) => e?.code === `functions/${code}`;

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

async function upload(c: Client, vendorId: string, submissionId: string, version: number, file: string, bytes: Uint8Array, contentType: string) {
  const path = `pod-documents/${vendorId}/${submissionId}/version-${version}/${file}`;
  await uploadBytes(ref(c.storage, path), bytes, { contentType, customMetadata: { originalName: `original-${file}` } });
  return path;
}
const newId = (c: Client) => doc(collection(c.db, 'podSubmissions')).id;
const status = async (c: Client, id: string) => (await getDoc(doc(c.db, 'podSubmissions', id))).get('currentStatus');
const notes = async (c: Client) => (await getDocs(query(collection(c.db, 'notifications'), where('userId', '==', c.auth.currentUser!.uid)))).docs.map((d) => d.data());

/** Staff sets their own password from the reset email (same as production onboarding). */
async function setPasswordViaEmail(c: Client, email: string, pw: string) {
  await sendPasswordResetEmail(c.auth, email);
  const res = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes } = (await res.json()) as { oobCodes: Array<{ email: string; requestType: string; oobCode: string }> };
  const code = oobCodes.filter((o) => o.email === email && o.requestType === 'PASSWORD_RESET').pop();
  assert(code, `reset code for ${email}`);
  await confirmPasswordReset(c.auth, code!.oobCode, pw);
  await signInWithEmailAndPassword(c.auth, email, pw);
}

async function main() {
  console.info(`E2E run ${run} (project ${PROJECT})\n`);
  const admin = client('admin');
  const vA = client('vendorA');
  const vB = client('vendorB');
  const catRice = client('catRice');
  const catSugar = client('catSugar');
  const billing = client('billing');
  const attacker = client('attacker');
  const today = new Date().toISOString().slice(0, 10);

  const base = { contactPerson: 'Test Contact', mobileNumber: '+91 98765 43210', address: '1 Test Street, Mumbai' };
  const vendorA = { ...base, vendorCode: `E2EA${run}`.slice(0, 30), vendorName: `E2E Alpha Rice ${run}`, email: `alpha.${lc}@example.com`, categories: ['RICE', 'PULSES'] };
  const vendorB = { ...base, vendorCode: `E2EB${run}`.slice(0, 30), vendorName: `E2E Beta Sugar ${run}`, email: `beta.${lc}@example.com`, categories: ['SUGAR'] };
  const staff = {
    rice: { email: `rice.${lc}@rcpl.example`, fullName: 'Rice Team', role: 'CATEGORY', categories: ['RICE'] },
    sugar: { email: `sugar.${lc}@rcpl.example`, fullName: 'Sugar Team', role: 'CATEGORY', categories: ['SUGAR'] },
    billing: { email: `billing.${lc}@rcpl.example`, fullName: 'Billing Team', role: 'BILLING', categories: [] },
  };
  let vendorAId = '';
  let vendorBId = '';
  let sugarUid = '';
  let pod1 = '';

  console.info('Setup — admin, vendors, staff');
  await step('Admin logs in; vendors require at least one category', async () => {
    await signInWithEmailAndPassword(admin.auth, ADMIN.email, ADMIN.password);
    await expectError(admin.call('createVendor', { ...vendorA, categories: [] }), appCode('VALIDATION'), 'no category');
    await expectError(admin.call('createVendor', { ...vendorA, categories: ['WHEAT'] }), appCode('VALIDATION'), 'unknown category');
    vendorAId = (await admin.call<{ vendorId: string }>('createVendor', vendorA)).vendorId;
    vendorBId = (await admin.call<{ vendorId: string }>('createVendor', vendorB)).vendorId;
    const v = await getDoc(doc(admin.db, 'vendors', vendorAId));
    assert(JSON.stringify(v.get('categories')) === '["PULSES","RICE"]', `categories ${v.get('categories')}`);
  });

  await step('Vendors activate (pending until approved) and admin approves', async () => {
    for (const [c, v, id] of [[vA, vendorA, vendorAId], [vB, vendorB, vendorBId]] as const) {
      await c.call('activateVendorAccount', { email: v.email, vendorCode: v.vendorCode, password, confirmPassword: password });
      await signInWithEmailAndPassword(c.auth, v.email, password);
      await expectError(getDocs(query(collection(c.db, 'podSubmissions'), where('vendorId', '==', id))), denied, 'pending vendor reads');
      const regs = await getDocs(query(collection(admin.db, 'vendorRegistrationRequests'), where('vendorId', '==', id), where('approvalStatus', '==', 'PENDING')));
      await admin.call('reviewVendorRegistration', { requestId: regs.docs[0].id, decision: 'APPROVED' });
    }
  });

  await step('Admin creates Category & Billing users; they set passwords via email', async () => {
    await expectError(admin.call('createStaffUser', { ...staff.rice, categories: [] }), appCode('VALIDATION'), 'category user without categories');
    await expectError(admin.call('createStaffUser', { ...staff.rice, email: vendorA.email }), (e) => e.code === 'functions/failed-precondition', 'vendor email reused');
    await admin.call('createStaffUser', staff.rice);
    sugarUid = (await admin.call<{ uid: string }>('createStaffUser', staff.sugar)).uid;
    await admin.call('createStaffUser', staff.billing);
    await setPasswordViaEmail(catRice, staff.rice.email, staffPassword);
    await setPasswordViaEmail(catSugar, staff.sugar.email, staffPassword);
    await setPasswordViaEmail(billing, staff.billing.email, staffPassword);
    const t = await catRice.auth.currentUser!.getIdTokenResult();
    assert(t.claims.role === 'CATEGORY', 'CATEGORY claim');
  });

  await step('Only admins can manage staff; self-signed-up users get nothing', async () => {
    await expectError(catRice.call('createStaffUser', { ...staff.rice, email: `x.${lc}@rcpl.example` }), denied, 'category creates staff');
    await createUserWithEmailAndPassword(attacker.auth, `attacker.${lc}@example.com`, 'Attack@123');
    await expectError(attacker.call('createStaffUser', staff.rice), denied, 'attacker creates staff');
    await expectError(getDocs(query(collection(attacker.db, 'podSubmissions'), where('category', '==', 'RICE'))), denied, 'attacker reads');
    await expectError(setDoc(doc(attacker.db, 'userProfiles', attacker.auth.currentUser!.uid), { role: 'ADMIN' }), denied, 'self-promotion');
  });

  console.info('\nVendor upload → category team');
  await step('Vendor uploads a RICE POD → "With Category Team"; wrong category refused', async () => {
    pod1 = newId(vA);
    await upload(vA, vendorAId, pod1, 1, 'pod-document.pdf', PDF('v1'), 'application/pdf');
    await upload(vA, vendorAId, pod1, 1, 'supporting-photo.png', PNG, 'image/png');
    const bad = newId(vA);
    await upload(vA, vendorAId, bad, 1, 'pod-document.pdf', PDF('x'), 'application/pdf');
    await expectError(vA.call('createPodSubmission', { submissionId: bad, category: 'SUGAR', poNumber: 'P', invoiceNumber: `BAD-${run}`, deliveryDate: today }), appCode('VALIDATION'), 'not vendor category');
    await expectError(vA.call('createPodSubmission', { submissionId: bad, category: 'RICE', poNumber: 'P', invoiceNumber: `BAD-${run}`, deliveryDate: today, forwardNow: true }), denied, 'vendor forwardNow');
    const r = await vA.call<{ submissionNumber: string; status: string }>('createPodSubmission', { submissionId: pod1, category: 'RICE', poNumber: `PO-${run}-1`, invoiceNumber: `INV-${run}-1`, deliveryDate: today });
    assert(r.status === 'SUBMITTED' && /^POD-\d+$/.test(r.submissionNumber), JSON.stringify(r));
  });

  await step('Rice team sees it (equality and "in" queries); Sugar team and Billing do not', async () => {
    assert((await status(catRice, pod1)) === 'SUBMITTED', 'rice team reads');
    const eq = await getDocs(query(collection(catRice.db, 'podSubmissions'), where('category', '==', 'RICE')));
    assert(eq.docs.some((d) => d.id === pod1), 'equality query');
    const inQ = await getDocs(query(collection(catRice.db, 'podSubmissions'), where('category', 'in', ['RICE'])));
    assert(inQ.docs.some((d) => d.id === pod1), 'in query');
    const n = await getCountFromServer(query(collection(catRice.db, 'podSubmissions'), where('category', '==', 'RICE'), where('currentStatus', '==', 'SUBMITTED')));
    assert(n.data().count >= 1, 'count');
    const docs = await getDocs(query(collection(catRice.db, 'podDocuments'), where('submissionId', '==', pod1), where('category', '==', 'RICE')));
    assert(docs.size === 2, 'rice team reads documents');
    await getBytes(ref(catRice.storage, `pod-documents/${vendorAId}/${pod1}/version-1/pod-document.pdf`));
    await expectError(getDoc(doc(catSugar.db, 'podSubmissions', pod1)), denied, 'sugar reads rice POD');
    await expectError(getDocs(query(collection(catSugar.db, 'podSubmissions'), where('category', '==', 'RICE'))), denied, 'sugar queries rice');
    await expectError(getBytes(ref(catSugar.storage, `pod-documents/${vendorAId}/${pod1}/version-1/pod-document.pdf`)), denied, 'sugar downloads rice file');
    await expectError(getDoc(doc(billing.db, 'podSubmissions', pod1)), denied, 'billing before forward');
    await expectError(billing.call('updatePodStatus', { submissionId: pod1, action: 'MARK_BILLED' }), (e) => denied(e) || fnCode('failed-precondition')(e), 'billing acts early');
    assert((await notes(catRice)).some((x) => x.title === 'New POD received'), 'rice team notified');
    assert((await notes(admin)).some((x) => x.title === 'New POD received' && String(x.message).includes(`INV-${run}-1`)), 'admin notified');
    const mails = await adminDb().collection('mail').get();
    const toRice = mails.docs.filter((m) => (m.get('to') as string[]).includes(staff.rice.email) && String(m.get('message.text')).includes(`INV-${run}-1`));
    assert(toRice.length === 1, `rice team emailed (${toRice.length})`);
    assert(mails.docs.some((m) => (m.get('to') as string[]).includes(ADMIN.email) && String(m.get('message.text')).includes(`INV-${run}-1`)), 'admin emailed');
    assert(!mails.docs.some((m) => (m.get('to') as string[]).includes(staff.sugar.email) && String(m.get('message.text')).includes(`INV-${run}-1`)), 'sugar team not emailed');
    await expectError(getDocs(collection(vA.db, 'mail')), denied, 'clients cannot read mail queue');
    assert(!(await notes(catSugar)).some((x) => String(x.message).includes(`INV-${run}-1`)), 'sugar team not notified');
  });

  await step('Rice team sends back with a reason; vendor sees it', async () => {
    await expectError(catRice.call('updatePodStatus', { submissionId: pod1, action: 'SEND_BACK' }), appCode('VALIDATION'), 'reason required');
    await expectError(catSugar.call('updatePodStatus', { submissionId: pod1, action: 'SEND_BACK', remarks: 'x' }), denied, 'sugar sends back rice');
    await catRice.call('updatePodStatus', { submissionId: pod1, action: 'SEND_BACK', remarks: 'Receiving stamp not visible' });
    const s = await getDoc(doc(vA.db, 'podSubmissions', pod1));
    assert(s.get('currentStatus') === 'RESUBMISSION_REQUESTED' && s.get('lastRemarks') === 'Receiving stamp not visible', 'vendor sees reason');
    assert((await notes(vA)).some((x) => x.title === 'New POD copy requested'), 'vendor notified');
  });

  await step('Category team re-uploads on the vendor’s behalf (v2); other categories cannot', async () => {
    await expectError(upload(catSugar, vendorAId, pod1, 2, 'pod-document.pdf', PDF('sugar'), 'application/pdf'), denied, 'sugar uploads into rice vendor');
    await upload(catRice, vendorAId, pod1, 2, 'pod-document.pdf', PDF('v2-from-whatsapp'), 'application/pdf');
    const r = await catRice.call<{ version: number; status: string }>('resubmitPodSubmission', { submissionId: pod1, note: 'Received on WhatsApp' });
    assert(r.version === 2 && r.status === 'SUBMITTED', JSON.stringify(r));
    assert((await notes(vA)).some((x) => x.title === 'New POD copy uploaded'), 'vendor informed of staff upload');
  });

  console.info('\nCategory → billing');
  await step('Rice team forwards to billing; billing can now see, read files and is notified', async () => {
    await expectError(billing.call('updatePodStatus', { submissionId: pod1, action: 'FORWARD' }), denied, 'billing forwards');
    await catRice.call('updatePodStatus', { submissionId: pod1, action: 'FORWARD' });
    assert((await status(billing, pod1)) === 'FORWARDED_TO_BILLING', 'billing reads');
    const list = await getDocs(query(collection(billing.db, 'podSubmissions'), where('billingVisible', '==', true), where('currentStatus', '==', 'FORWARDED_TO_BILLING')));
    assert(list.docs.some((d) => d.id === pod1), 'billing list');
    const docs = await getDocs(query(collection(billing.db, 'podDocuments'), where('submissionId', '==', pod1)));
    const v2 = docs.docs.find((d) => d.get('versionNumber') === 2 && d.get('documentType') === 'POD')!;
    assert(new TextDecoder().decode(await getBytes(ref(billing.storage, v2.get('storagePath')))).includes('v2-from-whatsapp'), 'billing downloads');
    const hist = await getDocs(query(collection(billing.db, 'podStatusHistory'), where('submissionId', '==', pod1)));
    assert(hist.size >= 4, 'billing reads history');
    assert((await notes(billing)).some((x) => x.title === 'POD forwarded to billing'), 'billing notified');
    assert((await notes(admin)).some((x) => x.title === 'POD forwarded to billing'), 'admin notified of forward');
    const mails = await adminDb().collection('mail').get();
    assert(mails.docs.some((m) => (m.get('to') as string[]).includes(staff.billing.email) && String(m.get('message.subject')).includes('forwarded to billing')), 'billing emailed');
    assert(!(await notes(catRice)).some((x) => x.title === 'POD forwarded to billing'), 'actor not notified of own action');
  });

  await step('Billing sends back → vendor re-uploads v3 → forward → billing marks BILLED', async () => {
    await expectError(catRice.call('updatePodStatus', { submissionId: pod1, action: 'MARK_BILLED' }), denied, 'category marks billed');
    await billing.call('updatePodStatus', { submissionId: pod1, action: 'SEND_BACK', remarks: 'Invoice copy missing' });
    assert((await status(vA, pod1)) === 'RESUBMISSION_REQUESTED', 'sent back');
    await upload(vA, vendorAId, pod1, 3, 'pod-document.pdf', PDF('v3'), 'application/pdf');
    await vA.call('resubmitPodSubmission', { submissionId: pod1 });
    assert((await status(catRice, pod1)) === 'SUBMITTED', 'back with category');
    await catRice.call('updatePodStatus', { submissionId: pod1, action: 'FORWARD' });
    await billing.call('updatePodStatus', { submissionId: pod1, action: 'MARK_BILLED' });
    assert((await status(vA, pod1)) === 'BILLED', 'billed');
    await expectError(billing.call('updatePodStatus', { submissionId: pod1, action: 'SEND_BACK', remarks: 'x' }), fnCode('failed-precondition'), 'after billed');
    const hist = await getDocs(query(collection(admin.db, 'podStatusHistory'), where('submissionId', '==', pod1)));
    const seq = hist.docs.map((d) => d.data()).sort((a, b) => a.updatedAt.toMillis() - b.updatedAt.toMillis()).map((h) => h.newStatus);
    const expected = ['SUBMITTED', 'RESUBMISSION_REQUESTED', 'SUBMITTED', 'FORWARDED_TO_BILLING', 'RESUBMISSION_REQUESTED', 'SUBMITTED', 'FORWARDED_TO_BILLING', 'BILLED'];
    assert(JSON.stringify(seq) === JSON.stringify(expected), `history ${seq}`);
    const docs = await getDocs(query(collection(admin.db, 'podDocuments'), where('submissionId', '==', pod1), where('documentType', '==', 'POD')));
    assert(docs.size === 3, 'all three versions kept');
  });

  console.info('\nCategory uploads on behalf of vendors');
  await step('Upload-vendor list is limited to the team’s categories', async () => {
    const r = await catRice.call<{ vendors: Array<{ id: string; categories: string[] }> }>('listUploadVendors');
    const a = r.vendors.find((v) => v.id === vendorAId);
    assert(a && JSON.stringify(a.categories) === '["RICE"]', 'vendor A with RICE only');
    assert(!r.vendors.some((v) => v.id === vendorBId), 'sugar vendor hidden');
    await expectError(vA.call('listUploadVendors'), denied, 'vendor lists');
  });

  await step('Rice team uploads for vendor A with "forward now" → straight to billing', async () => {
    const id = newId(catRice);
    await upload(catRice, vendorAId, id, 1, 'pod-document.jpg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]), 'image/jpeg');
    const r = await catRice.call<{ status: string }>('createPodSubmission', { submissionId: id, vendorId: vendorAId, category: 'RICE', poNumber: `PO-${run}-W`, invoiceNumber: `INV-${run}-W`, deliveryDate: today, forwardNow: true });
    assert(r.status === 'FORWARDED_TO_BILLING', JSON.stringify(r));
    assert((await getDoc(doc(vA.db, 'podSubmissions', id))).get('uploadedByRole') === 'CATEGORY', 'vendor sees staff upload');
    assert((await status(billing, id)) === 'FORWARDED_TO_BILLING', 'billing sees');
  });

  await step('Category team cannot upload for vendors / categories outside their assignment', async () => {
    const id = newId(catRice);
    await expectError(upload(catRice, vendorBId, id, 1, 'pod-document.pdf', PDF('x'), 'application/pdf'), denied, 'rice uploads into sugar vendor');
    await expectError(catRice.call('createPodSubmission', { submissionId: id, vendorId: vendorAId, category: 'PULSES', poNumber: 'P', invoiceNumber: `PUL-${run}`, deliveryDate: today }), denied, 'rice team, pulses category');
    const sid = newId(catSugar);
    await upload(catSugar, vendorBId, sid, 1, 'pod-document.pdf', PDF('sugar'), 'application/pdf');
    const r = await catSugar.call<{ status: string }>('createPodSubmission', { submissionId: sid, vendorId: vendorBId, category: 'SUGAR', poNumber: 'PS', invoiceNumber: `SUG-${run}`, deliveryDate: today });
    assert(r.status === 'SUBMITTED', 'sugar team uploads for sugar vendor');
    await expectError(getDoc(doc(catRice.db, 'podSubmissions', sid)), denied, 'rice reads sugar POD');
    assert((await status(vB, sid)) === 'SUBMITTED', 'vendor B sees it');
    await expectError(getDoc(doc(vA.db, 'podSubmissions', sid)), denied, 'vendor A reads vendor B POD');
  });

  console.info('\nCategory teams manage vendors');
  const vendorC = { ...base, vendorCode: `E2EC${run}`.slice(0, 30), vendorName: `E2E Gamma Multi ${run}`, email: `gamma.${lc}@example.com`, categories: ['RICE'] };
  let vendorCId = '';
  await step('New vendor: login is pre-created; Firebase "set password" link → first login → approval request', async () => {
    const vd = { ...base, vendorCode: `E2ED${run}`.slice(0, 30), vendorName: `E2E Delta ${run}`, email: `delta.${lc}@example.com`, categories: ['RICE'] };
    const r = await catRice.call<{ vendorId: string; email: string }>('createVendor', vd);
    assert(r.email === vd.email, 'email returned for the Firebase email');
    const v = await getDoc(doc(admin.db, 'vendors', r.vendorId));
    assert(v.get('authUid') && v.get('accountStatus') === 'NOT_REGISTERED', 'login created, still not registered');
    const d = client('vendorD');
    await setPasswordViaEmail(d, vd.email, password); // Firebase reset email → set password → sign in
    await expectError(getDocs(query(collection(d.db, 'podSubmissions'), where('vendorId', '==', r.vendorId))), denied, 'no data before approval');
    const done = await d.call<{ status: string }>('completeVendorActivation', {});
    assert(done.status === 'PENDING_APPROVAL', `status ${done.status}`);
    const again = await d.call<{ status: string }>('completeVendorActivation', {});
    assert(again.status === 'PENDING_APPROVAL', 'idempotent');
    const regs = await getDocs(query(collection(catRice.db, 'vendorRegistrationRequests'), where('categories', 'array-contains-any', ['RICE']), where('approvalStatus', '==', 'PENDING')));
    const reg = regs.docs.find((x) => x.get('vendorId') === r.vendorId);
    assert(reg, 'approval request created');
    assert((await notes(admin)).some((x) => x.title === 'Vendor approval request' && String(x.message).includes(vd.vendorName)), 'admin notified');
    await catRice.call('reviewVendorRegistration', { requestId: reg!.id, decision: 'APPROVED' });
    await d.auth.currentUser!.getIdToken(true);
    await getDocs(query(collection(d.db, 'podSubmissions'), where('vendorId', '==', r.vendorId)));
    const other = await vB.call<{ status: string }>('completeVendorActivation', {});
    assert(other.status === 'ACTIVE', 'already-active vendor unaffected');
  });

  await step('Category team creates vendors only with its own categories', async () => {
    await expectError(catRice.call('createVendor', { ...vendorC, categories: ['SUGAR'] }), denied, 'foreign category');
    vendorCId = (await catRice.call<{ vendorId: string }>('createVendor', vendorC)).vendorId;
    assert((await notes(admin)).some((x) => x.title === 'New vendor added' && String(x.message).includes(vendorC.vendorName)), 'admin told about new vendor');
    const inv = await catRice.call<{ email: string }>('sendVendorInvite', { vendorId: vendorCId });
    assert(inv.email === vendorC.email, 'resend returns email for the Firebase email');
    await expectError(catRice.call('sendVendorInvite', { vendorId: vendorAId }), fnCode('failed-precondition'), 'already activated');
    const v = await getDoc(doc(catRice.db, 'vendors', vendorCId));
    assert(v.get('createdByRole') === 'CATEGORY', 'created by category');
    const list = await getDocs(query(collection(catRice.db, 'vendors'), where('categories', 'array-contains-any', ['RICE'])));
    assert(list.docs.some((d) => d.id === vendorCId), 'rice team lists vendor');
    await expectError(getDoc(doc(catSugar.db, 'vendors', vendorCId)), denied, 'sugar cannot see rice vendor yet');
    await expectError(billing.call('createVendor', { ...vendorC, vendorCode: 'BILL1' }), denied, 'billing creates vendor');
  });

  await step('Another team links an existing vendor to its category (code + email must match)', async () => {
    await expectError(catSugar.call('createVendor', { ...vendorC, categories: ['SUGAR'] }), fnCode('already-exists'), 'duplicate vendor');
    await expectError(catSugar.call('linkVendorCategories', { vendorCode: vendorC.vendorCode, email: 'wrong@example.com', categories: ['SUGAR'] }), fnCode('not-found'), 'wrong email');
    await expectError(catSugar.call('linkVendorCategories', { vendorCode: vendorC.vendorCode, email: vendorC.email, categories: ['RICE'] }), denied, 'link foreign category');
    const r = await catSugar.call<{ categories: string[] }>('linkVendorCategories', { vendorCode: vendorC.vendorCode, email: vendorC.email, categories: ['SUGAR'] });
    assert(JSON.stringify(r.categories) === '["RICE","SUGAR"]', `categories ${r.categories}`);
    assert((await getDoc(doc(catSugar.db, 'vendors', vendorCId))).exists(), 'sugar now sees vendor');
  });

  await step('Category edits keep other teams’ categories; editing outside scope is refused', async () => {
    await catSugar.call('updateVendor', { vendorId: vendorCId, ...vendorC, contactPerson: 'Sugar Edited', categories: ['SUGAR'] });
    let v = await getDoc(doc(admin.db, 'vendors', vendorCId));
    assert(JSON.stringify(v.get('categories')) === '["RICE","SUGAR"]' && v.get('contactPerson') === 'Sugar Edited', 'rice kept');
    await catSugar.call('updateVendor', { vendorId: vendorCId, ...vendorC, categories: ['RICE'] }); // sugar removes itself
    v = await getDoc(doc(admin.db, 'vendors', vendorCId));
    assert(JSON.stringify(v.get('categories')) === '["RICE"]', `after removal ${v.get('categories')}`);
    await expectError(catSugar.call('updateVendor', { vendorId: vendorCId, ...vendorC, categories: ['SUGAR'] }), fnCode('not-found'), 'sugar no longer has access');
    await expectError(catRice.call('updateVendor', { vendorId: vendorBId, ...vendorB }), fnCode('not-found'), 'rice edits sugar vendor');
    await catSugar.call('linkVendorCategories', { vendorCode: vendorC.vendorCode, email: vendorC.email, categories: ['SUGAR'] });
  });

  await step('Category team sees and approves registrations for its vendors; billing cannot', async () => {
    const c = client('vendorC');
    await c.call('activateVendorAccount', { email: vendorC.email, vendorCode: vendorC.vendorCode, password, confirmPassword: password });
    const regs = await getDocs(query(collection(catSugar.db, 'vendorRegistrationRequests'), where('categories', 'array-contains-any', ['SUGAR']), where('approvalStatus', '==', 'PENDING')));
    const reg = regs.docs.find((d) => d.get('vendorId') === vendorCId);
    assert(reg, 'sugar team sees request');
    assert((await notes(catRice)).some((x) => x.title === 'Vendor approval request'), 'rice team notified');
    assert((await notes(admin)).some((x) => x.title === 'Vendor approval request'), 'admin notified');
    await expectError(getDocs(query(collection(billing.db, 'vendorRegistrationRequests'), where('approvalStatus', '==', 'PENDING'))), denied, 'billing reads requests');
    await expectError(billing.call('reviewVendorRegistration', { requestId: reg!.id, decision: 'APPROVED' }), denied, 'billing approves');
    const hist = await getDocs(query(collection(catRice.db, 'vendorRegistrationRequests'), where('vendorId', '==', vendorCId), where('categories', 'array-contains-any', ['RICE'])));
    assert(hist.size === 1, 'rice reads vendor registration history');
    await catSugar.call('reviewVendorRegistration', { requestId: reg!.id, decision: 'APPROVED' });
    assert((await getDoc(doc(admin.db, 'vendors', vendorCId))).get('accountStatus') === 'ACTIVE', 'approved by category');
  });

  await step('Category team deactivates / reactivates its vendor', async () => {
    await catRice.call('deactivateVendor', { vendorId: vendorCId });
    assert((await getDoc(doc(admin.db, 'vendors', vendorCId))).get('accountStatus') === 'DEACTIVATED', 'deactivated');
    await expectError(catRice.call('deactivateVendor', { vendorId: vendorBId }), fnCode('not-found'), 'outside scope');
    await catRice.call('reactivateVendor', { vendorId: vendorCId });
    assert((await getDoc(doc(admin.db, 'vendors', vendorCId))).get('accountStatus') === 'ACTIVE', 'reactivated');
  });

  console.info('\nAccess control');
  await step('Duplicate invoices are refused; vendors cannot change statuses', async () => {
    const id = newId(vA);
    await upload(vA, vendorAId, id, 1, 'pod-document.pdf', PDF('dup'), 'application/pdf');
    await expectError(vA.call('createPodSubmission', { submissionId: id, category: 'RICE', poNumber: 'X', invoiceNumber: `inv-${run}-1`, deliveryDate: today }), fnCode('already-exists'), 'duplicate invoice');
    await expectError(vA.call('updatePodStatus', { submissionId: pod1, action: 'FORWARD' }), denied, 'vendor forwards');
    await expectError(updateDoc(doc(vA.db, 'podSubmissions', pod1), { currentStatus: 'BILLED' }), denied, 'direct write');
  });

  await step('Admin edits a category user; deactivating staff blocks access immediately', async () => {
    await admin.call('updateStaffUser', { uid: sugarUid, fullName: 'Sugar & Salt Team', role: 'CATEGORY', categories: ['SUGAR', 'SALT'] });
    const p = await getDoc(doc(admin.db, 'userProfiles', sugarUid));
    assert(JSON.stringify(p.get('categories')) === '["SALT","SUGAR"]', 'categories updated');
    await admin.call('setStaffActive', { uid: sugarUid, active: false });
    await expectError(getDocs(query(collection(catSugar.db, 'podSubmissions'), where('category', '==', 'SUGAR'))), denied, 'inactive staff reads');
    const fresh = client('sugar2');
    await expectError(signInWithEmailAndPassword(fresh.auth, staff.sugar.email, staffPassword), (e) => e.code === 'auth/user-disabled', 'disabled login');
    await admin.call('setStaffActive', { uid: sugarUid, active: true });
    await signInWithEmailAndPassword(fresh.auth, staff.sugar.email, staffPassword);
    await getDocs(query(collection(fresh.db, 'podSubmissions'), where('category', '==', 'SUGAR')));
  });

  await step('Deactivated vendor is blocked; admin sees everything', async () => {
    await admin.call('deactivateVendor', { vendorId: vendorBId });
    await expectError(getDocs(query(collection(vB.db, 'podSubmissions'), where('vendorId', '==', vendorBId))), denied, 'deactivated vendor');
    await admin.call('reactivateVendor', { vendorId: vendorBId });
    const all = await getCountFromServer(query(collection(admin.db, 'podSubmissions'), where('vendorId', '==', vendorAId)));
    assert(all.data().count >= 2, 'admin counts');
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
