/**
 * End-to-end workflow test against a real database + storage, through the
 * real HTTP API. Covers the 13 MVP acceptance scenarios plus security checks.
 *
 *   npm run test:e2e
 *
 * Uses unique vendor codes per run, so it can be re-run safely. Requires the
 * demo admin from `npm run db:seed` (or set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD).
 */
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { pool, withUser } from '../db/pool.js';
import { storage } from '../storage/index.js';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@rcpl.demo';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@12345';
const run = Date.now().toString(36).toUpperCase();

let base = '';
let passed = 0;
const failures: string[] = [];

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.info(`  ✔ ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`  ✘ ${name}\n      ${(err as Error).message}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(base + path, { method, headers, body });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

const pdf = (label: string) => new Blob([`%PDF-1.4\n% dummy POD ${label}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF`], { type: 'application/pdf' });
const png = () =>
  new Blob(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    ],
    { type: 'image/png' },
  );

function podForm(fields: Record<string, string>, file: Blob | null, fileName = 'pod.pdf', photo?: Blob) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (file) f.append('podDocument', file, fileName);
  if (photo) f.append('supportingPhoto', photo, 'photo.png');
  return f;
}

async function main() {
  await storage.init();
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  console.info(`E2E run ${run} against ${base}\n`);

  const today = new Date().toISOString().slice(0, 10);
  const vendorA = { vendorCode: `E2EA${run}`.slice(0, 30), vendorName: `E2E Alpha Foods ${run}`, email: `alpha.${run.toLowerCase()}@example.com`, contactPerson: 'Test Contact', mobileNumber: '+91 98765 43210', address: '1 Test Street, Mumbai' };
  const vendorB = { ...vendorA, vendorCode: `E2EB${run}`.slice(0, 30), vendorName: `E2E Beta Agro ${run}`, email: `beta.${run.toLowerCase()}@example.com` };
  const password = 'Vendor@123';
  let adminToken = '';
  let vendorToken = '';
  let vendorBToken = '';
  let vendorAId = '';
  let vendorBId = '';
  let regId = '';
  let sub1: any;
  let sub2: any;

  console.info('Phase 1 — onboarding');
  await step('Admin can log in through the admin portal', async () => {
    const r = await api('POST', '/auth/login', { body: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD, portal: 'admin' } });
    assert(r.status === 200, `login failed: ${r.status} ${JSON.stringify(r.json)}`);
    adminToken = r.json.accessToken;
  });

  await step('1. Admin creates a vendor record', async () => {
    const r = await api('POST', '/admin/vendors', { token: adminToken, body: vendorA });
    assert(r.status === 201, `create vendor: ${r.status} ${JSON.stringify(r.json)}`);
    assert(r.json.vendor.accountStatus === 'NOT_REGISTERED', 'new vendor should be NOT_REGISTERED');
    vendorAId = r.json.vendor.id;
    const dup = await api('POST', '/admin/vendors', { token: adminToken, body: vendorA });
    assert(dup.status === 409, `duplicate vendor code should be 409, got ${dup.status}`);
    const r2 = await api('POST', '/admin/vendors', { token: adminToken, body: vendorB });
    assert(r2.status === 201, 'create vendor B');
    vendorBId = r2.json.vendor.id;
  });

  await step('Activation rejects unknown email / wrong vendor code', async () => {
    const r = await api('POST', '/auth/activate', { body: { email: 'random@example.com', vendorCode: vendorA.vendorCode, password, confirmPassword: password } });
    assert(r.status === 400, `expected 400, got ${r.status}`);
    const r2 = await api('POST', '/auth/activate', { body: { email: vendorA.email, vendorCode: 'WRONG1', password, confirmPassword: password } });
    assert(r2.status === 400, `expected 400, got ${r2.status}`);
    const weak = await api('POST', '/auth/activate', { body: { email: vendorA.email, vendorCode: vendorA.vendorCode, password: 'short', confirmPassword: 'short' } });
    assert(weak.status === 400, 'weak password must be rejected');
  });

  await step('2. Vendor creates a password (first-time activation)', async () => {
    const r = await api('POST', '/auth/activate', { body: { email: vendorA.email, vendorCode: vendorA.vendorCode.toLowerCase(), password, confirmPassword: password } });
    assert(r.status === 201, `activate: ${r.status} ${JSON.stringify(r.json)}`);
    const again = await api('POST', '/auth/activate', { body: { email: vendorA.email, vendorCode: vendorA.vendorCode, password, confirmPassword: password } });
    assert(again.status === 409, `second activation should be 409, got ${again.status}`);
  });

  await step('3. Vendor account goes into PENDING_APPROVAL with a registration request', async () => {
    const r = await api('GET', `/admin/vendors/${vendorAId}`, { token: adminToken });
    assert(r.json.vendor.accountStatus === 'PENDING_APPROVAL', `status is ${r.json.vendor.accountStatus}`);
    const regs = await api('GET', `/admin/registrations?status=PENDING&search=${encodeURIComponent(vendorA.vendorCode)}`, { token: adminToken });
    assert(regs.json.items.length === 1, 'pending registration request missing');
    regId = regs.json.items[0].id;
  });

  await step('4. Vendor cannot access the dashboard before approval (API + DB level)', async () => {
    const r = await api('POST', '/auth/login', { body: { identifier: vendorA.email, password, portal: 'vendor' } });
    assert(r.status === 403 && r.json.error.code === 'ACCOUNT_PENDING', `expected 403 ACCOUNT_PENDING, got ${r.status} ${JSON.stringify(r.json)}`);
    assert(!r.json.accessToken, 'no token may be issued to a pending vendor');
    // Bypass attempt: even with a valid auth session, RLS hides all vendor data.
    const { rows } = await pool.query('select auth_user_id from public.user_profiles where vendor_id = $1', [vendorAId]);
    const visible = await withUser(rows[0].auth_user_id, async (db) => (await db.query('select count(*)::int as n from public.vendors')).rows[0].n);
    assert(visible === 0, `pending vendor can see ${visible} vendor rows via DB`);
    const insert = await withUser(rows[0].auth_user_id, (db) =>
      db.query(`insert into public.pod_submissions (vendor_id, po_number, invoice_number, delivery_date) values ($1, 'X', 'Y', current_date)`, [vendorAId]),
    ).then(() => 'inserted', (e) => e.code);
    assert(insert === '42501', `pending vendor DB insert should be blocked by RLS, got ${insert}`);
  });

  await step('Vendor with wrong portal is refused', async () => {
    const r = await api('POST', '/auth/login', { body: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD, portal: 'vendor' } });
    assert(r.status === 403 && r.json.error.code === 'WRONG_PORTAL', `got ${r.status}`);
  });

  await step('5. Admin approves the vendor', async () => {
    const r = await api('POST', `/admin/registrations/${regId}/approve`, { token: adminToken, body: {} });
    assert(r.status === 200 && r.json.vendor.accountStatus === 'ACTIVE', `approve: ${r.status} ${JSON.stringify(r.json)}`);
    const twice = await api('POST', `/admin/registrations/${regId}/approve`, { token: adminToken, body: {} });
    assert(twice.status === 409, 'double approval should be 409');
  });

  await step('6. Vendor logs in successfully (email and vendor-code User ID)', async () => {
    const r = await api('POST', '/auth/login', { body: { identifier: vendorA.vendorCode, password, portal: 'vendor' } });
    assert(r.status === 200, `login: ${r.status} ${JSON.stringify(r.json)}`);
    vendorToken = r.json.accessToken;
    const me = await api('GET', '/auth/me', { token: vendorToken });
    assert(me.json.user.vendor.status === 'ACTIVE', 'me should report ACTIVE');
    const dash = await api('GET', '/vendor/dashboard', { token: vendorToken });
    assert(dash.status === 200 && dash.json.stats.total === 0, 'empty dashboard expected');
    const bad = await api('POST', '/auth/login', { body: { identifier: vendorA.email, password: 'Wrong@123', portal: 'vendor' } });
    assert(bad.status === 401, 'wrong password should be 401');
  });

  console.info('\nPhase 2 — POD submission');
  await step('Upload validation: missing file, bad type, fake PDF, future date', async () => {
    const fields = { poNumber: `PO-${run}-1`, invoiceNumber: `INV-${run}-1`, deliveryDate: today };
    const noFile = await api('POST', '/vendor/submissions', { token: vendorToken, form: podForm(fields, null) });
    assert(noFile.status === 400, `missing file should be 400, got ${noFile.status}`);
    const exe = await api('POST', '/vendor/submissions', { token: vendorToken, form: podForm(fields, new Blob(['MZ'], { type: 'application/x-msdownload' }), 'pod.exe') });
    assert(exe.status === 400, `exe should be 400, got ${exe.status}`);
    const fake = await api('POST', '/vendor/submissions', { token: vendorToken, form: podForm(fields, new Blob(['not a pdf'], { type: 'application/pdf' }), 'pod.pdf') });
    assert(fake.status === 400, `fake pdf should be 400, got ${fake.status}`);
    const future = await api('POST', '/vendor/submissions', { token: vendorToken, form: podForm({ ...fields, deliveryDate: '2999-01-01' }, pdf('x')) });
    assert(future.status === 400, `future date should be 400, got ${future.status}`);
    const missing = await api('POST', '/vendor/submissions', { token: vendorToken, form: podForm({ deliveryDate: today }, pdf('x')) });
    assert(missing.status === 400, 'missing PO/invoice should be 400');
  });

  await step('7. Vendor uploads a POD (with supporting photo)', async () => {
    const r = await api('POST', '/vendor/submissions', {
      token: vendorToken,
      form: podForm({ poNumber: `PO-${run}-1`, invoiceNumber: `INV-${run}-1`, deliveryDate: today, deliveryReference: 'LR-001' }, pdf('one'), 'pod-one.pdf', png()),
    });
    assert(r.status === 201, `upload: ${r.status} ${JSON.stringify(r.json)}`);
    sub1 = r.json.submission;
    assert(/^POD-\d+$/.test(sub1.submissionNumber), 'submission number format');
    assert(sub1.status === 'UNDER_REVIEW', 'status should be UNDER_REVIEW');
    const dup = await api('POST', '/vendor/submissions', { token: vendorToken, form: podForm({ poNumber: 'PO-X', invoiceNumber: `inv-${run}-1`, deliveryDate: today }, pdf('dup')) });
    assert(dup.status === 409, `duplicate invoice should be 409, got ${dup.status}`);
    const list = await api('GET', '/vendor/submissions', { token: vendorToken });
    assert(list.json.items.some((s: any) => s.id === sub1.id), 'appears in My Submissions');
    const notes = await api('GET', '/notifications', { token: vendorToken });
    assert(notes.json.items.some((n: any) => n.title === 'POD submitted'), 'vendor notified of submission');
  });

  await step('Another vendor cannot see or download vendor A documents', async () => {
    const act = await api('POST', '/auth/activate', { body: { email: vendorB.email, vendorCode: vendorB.vendorCode, password, confirmPassword: password } });
    assert(act.status === 201, 'activate B');
    const regs = await api('GET', `/admin/registrations?status=PENDING&search=${encodeURIComponent(vendorB.vendorCode)}`, { token: adminToken });
    await api('POST', `/admin/registrations/${regs.json.items[0].id}/approve`, { token: adminToken, body: {} });
    vendorBToken = (await api('POST', '/auth/login', { body: { identifier: vendorB.email, password, portal: 'vendor' } })).json.accessToken;
    assert(vendorBToken, 'vendor B login');
    const view = await api('GET', `/vendor/submissions/${sub1.id}`, { token: vendorBToken });
    assert(view.status === 404, `vendor B viewing A's submission should be 404, got ${view.status}`);
    const detail = await api('GET', `/vendor/submissions/${sub1.id}`, { token: vendorToken });
    const docId = detail.json.documents[0].id;
    const dl = await api('GET', `/documents/${docId}/file`, { token: vendorBToken });
    assert(dl.status === 404, `vendor B downloading A's file should be 404, got ${dl.status}`);
    const listB = await api('GET', '/vendor/submissions', { token: vendorBToken });
    assert(listB.json.total === 0, 'vendor B list must be empty');
    const adminRoute = await api('GET', '/admin/vendors', { token: vendorBToken });
    assert(adminRoute.status === 403, 'vendor must not access admin routes');
    const anon = await api('GET', '/vendor/dashboard');
    assert(anon.status === 401, 'anonymous access must be 401');
  });

  console.info('\nPhase 3 — admin review');
  await step('8. Admin views the POD and can download the document', async () => {
    const r = await api('GET', `/admin/submissions/${sub1.id}`, { token: adminToken });
    assert(r.status === 200 && r.json.documents.length === 2, `expected POD + photo, got ${JSON.stringify(r.json.documents)}`);
    const pod = r.json.documents.find((d: any) => d.documentType === 'POD');
    const dl = await fetch(`${base}/documents/${pod.id}/file?download=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert(dl.status === 200 && dl.headers.get('content-type') === 'application/pdf', `download status ${dl.status}`);
    assert((await dl.text()).includes('dummy POD one'), 'downloaded content mismatch');
    assert(dl.headers.get('content-disposition')?.startsWith('attachment'), 'download disposition');
    const list = await api('GET', `/admin/submissions?status=UNDER_REVIEW&search=${encodeURIComponent(vendorA.vendorCode)}`, { token: adminToken });
    assert(list.json.items.some((s: any) => s.id === sub1.id), 'admin list filter');
  });

  await step('9. Admin approves the POD', async () => {
    const r = await api('POST', `/admin/submissions/${sub1.id}/approve`, { token: adminToken, body: {} });
    assert(r.status === 200 && r.json.submission.status === 'APPROVED', `approve: ${r.status} ${JSON.stringify(r.json)}`);
    const again = await api('POST', `/admin/submissions/${sub1.id}/reject`, { token: adminToken, body: { remarks: 'late' } });
    assert(again.status === 409, 'cannot review an approved POD again');
  });

  await step('10. Vendor sees the approved status + notification', async () => {
    const r = await api('GET', `/vendor/submissions/${sub1.id}`, { token: vendorToken });
    assert(r.json.submission.status === 'APPROVED', 'vendor should see APPROVED');
    const notes = await api('GET', '/notifications', { token: vendorToken });
    assert(notes.json.items.some((n: any) => n.title === 'POD approved'), 'approval notification');
    const dash = await api('GET', '/vendor/dashboard', { token: vendorToken });
    assert(dash.json.stats.APPROVED === 1 && dash.json.stats.total === 1, 'dashboard stats from DB');
  });

  await step('11. Admin rejects another POD with mandatory remarks', async () => {
    const up = await api('POST', '/vendor/submissions', { token: vendorToken, form: podForm({ poNumber: `PO-${run}-2`, invoiceNumber: `INV-${run}-2`, deliveryDate: today }, png(), 'pod-two.png') });
    assert(up.status === 201, 'second upload');
    sub2 = up.json.submission;
    const noRemarks = await api('POST', `/admin/submissions/${sub2.id}/reject`, { token: adminToken, body: { remarks: '  ' } });
    assert(noRemarks.status === 400, `reject without remarks should be 400, got ${noRemarks.status}`);
    const reuploadEarly = await api('POST', `/vendor/submissions/${sub2.id}/reupload`, { token: vendorToken, form: podForm({}, pdf('early')) });
    assert(reuploadEarly.status === 409, 'cannot re-upload while under review');
    const r = await api('POST', `/admin/submissions/${sub2.id}/reject`, { token: adminToken, body: { remarks: 'Receiving stamp not visible' } });
    assert(r.status === 200 && r.json.submission.status === 'REJECTED', 'reject');
  });

  await step('12. Vendor sees the rejection reason and re-uploads', async () => {
    const r = await api('GET', `/vendor/submissions/${sub2.id}`, { token: vendorToken });
    assert(r.json.submission.adminRemarks === 'Receiving stamp not visible', 'remarks visible to vendor');
    const notes = await api('GET', '/notifications', { token: vendorToken });
    assert(notes.json.items.some((n: any) => n.message.includes('Receiving stamp not visible')), 'rejection notification with remarks');
    const re = await api('POST', `/vendor/submissions/${sub2.id}/reupload`, { token: vendorToken, form: podForm({ note: 'Clear scan with stamp' }, pdf('two-v2'), 'pod-two-v2.pdf') });
    assert(re.status === 200 && re.json.submission.status === 'UNDER_REVIEW' && re.json.submission.currentVersion === 2, `reupload: ${re.status} ${JSON.stringify(re.json)}`);
  });

  await step('13. Admin reviews the new version (old version preserved, history kept)', async () => {
    const r = await api('GET', `/admin/submissions/${sub2.id}`, { token: adminToken });
    const versions = r.json.documents.filter((d: any) => d.documentType === 'POD').map((d: any) => d.versionNumber);
    assert(versions.includes(1) && versions.includes(2), `both versions kept, got ${versions}`);
    const statuses = r.json.history.map((h: any) => h.newStatus).reverse();
    assert(JSON.stringify(statuses) === JSON.stringify(['UNDER_REVIEW', 'REJECTED', 'UNDER_REVIEW']), `history ${statuses}`);
    const ap = await api('POST', `/admin/submissions/${sub2.id}/approve`, { token: adminToken, body: { remarks: 'Verified' } });
    assert(ap.json.submission.status === 'APPROVED', 'approve v2');
  });

  console.info('\nAdmin vendor management');
  await step('Admin dashboard statistics are computed from records', async () => {
    const r = await api('GET', '/admin/dashboard', { token: adminToken });
    const { rows } = await pool.query(`select count(*)::int as n from public.pod_submissions where current_status = 'APPROVED'`);
    assert(r.json.pods.APPROVED === rows[0].n, 'approved count matches DB');
    assert(r.json.vendors.total >= 2, 'vendor count');
  });

  await step('Admin edits vendor details; email locked after activation', async () => {
    const ok = await api('PUT', `/admin/vendors/${vendorAId}`, { token: adminToken, body: { ...vendorA, contactPerson: 'Updated Contact' } });
    assert(ok.status === 200 && ok.json.vendor.contactPerson === 'Updated Contact', 'edit');
    const emailChange = await api('PUT', `/admin/vendors/${vendorAId}`, { token: adminToken, body: { ...vendorA, email: 'new@example.com' } });
    assert(emailChange.status === 400, 'email change after activation should be refused');
    const search = await api('GET', `/admin/vendors?search=${encodeURIComponent(vendorA.vendorName.toLowerCase())}`, { token: adminToken });
    assert(search.json.items.length === 1, 'search by name');
  });

  await step('Deactivated vendor is blocked immediately; history preserved; reactivation works', async () => {
    const d = await api('POST', `/admin/vendors/${vendorBId}/deactivate`, { token: adminToken });
    assert(d.json.vendor.accountStatus === 'DEACTIVATED', 'deactivate');
    const blocked = await api('GET', '/vendor/dashboard', { token: vendorBToken });
    assert(blocked.status === 403 && blocked.json.error.code === 'ACCOUNT_DEACTIVATED', `existing token should be blocked, got ${blocked.status}`);
    const login = await api('POST', '/auth/login', { body: { identifier: vendorB.email, password, portal: 'vendor' } });
    assert(login.status === 403, 'deactivated login blocked');
    const re = await api('POST', `/admin/vendors/${vendorBId}/reactivate`, { token: adminToken });
    assert(re.json.vendor.accountStatus === 'ACTIVE', 'reactivate');
    const hist = await api('GET', `/admin/submissions?vendorId=${vendorAId}`, { token: adminToken });
    assert(hist.json.total === 2, 'vendor A history intact');
  });

  await step('Registration rejection shows the rejected message', async () => {
    const vc = { ...vendorA, vendorCode: `E2EC${run}`.slice(0, 30), vendorName: `E2E Gamma ${run}`, email: `gamma.${run.toLowerCase()}@example.com` };
    await api('POST', '/admin/vendors', { token: adminToken, body: vc });
    await api('POST', '/auth/activate', { body: { email: vc.email, vendorCode: vc.vendorCode, password, confirmPassword: password } });
    const regs = await api('GET', `/admin/registrations?status=PENDING&search=${encodeURIComponent(vc.vendorCode)}`, { token: adminToken });
    await api('POST', `/admin/registrations/${regs.json.items[0].id}/reject`, { token: adminToken, body: { remarks: 'Unknown vendor' } });
    const login = await api('POST', '/auth/login', { body: { identifier: vc.email, password, portal: 'vendor' } });
    assert(login.status === 403 && login.json.error.code === 'ACCOUNT_REJECTED', `got ${login.status} ${JSON.stringify(login.json)}`);
  });

  await step('Password reset flow (forgot → reset → login)', async () => {
    const f = await api('POST', '/auth/forgot-password', { body: { email: 'nobody@example.com' } });
    assert(f.status === 200, 'forgot for unknown email still 200');
    const { authProvider } = await import('../auth/index.js');
    if (authProvider.name !== 'local') return; // Supabase sends a real email
    const { rows } = await pool.query('select id, encrypted_password from auth.users where email = $1', [vendorA.email]);
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign({ sub: rows[0].id, typ: 'reset', fp: rows[0].encrypted_password.slice(-12) }, process.env.LOCAL_JWT_SECRET!, { expiresIn: 600 });
    const r = await api('POST', '/auth/reset-password', { body: { token, password: 'NewPass@456', confirmPassword: 'NewPass@456' } });
    assert(r.status === 200, `reset: ${r.status} ${JSON.stringify(r.json)}`);
    const reuse = await api('POST', '/auth/reset-password', { body: { token, password: 'Other@789x', confirmPassword: 'Other@789x' } });
    assert(reuse.status === 400, 'reset token must be single-use');
    const login = await api('POST', '/auth/login', { body: { identifier: vendorA.email, password: 'NewPass@456', portal: 'vendor' } });
    assert(login.status === 200, 'login with new password');
  });

  server.close();
  console.info(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('Failed:\n - ' + failures.join('\n - '));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
