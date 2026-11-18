/**
 * One-time migration to the category / billing workflow (v3).
 *
 *   - POD statuses:  UNDER_REVIEW/PENDING → SUBMITTED
 *                    APPROVED             → FORWARDED_TO_BILLING (billingVisible)
 *                    REJECTED             → RESUBMISSION_REQUESTED (reason kept)
 *   - Adds `category` to old submissions, their documents and history
 *     (vendor's first category, or --default-category).
 *   - Marks existing staff profiles as active.
 *   - Lists vendors that still need categories (edit them in the Admin portal).
 *
 *   npx tsx scripts/migrate-v3.ts --project rcpl-pod-prod --default-category RICE [--dry-run]
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { project: { type: 'string' }, emulator: { type: 'boolean' }, 'default-category': { type: 'string' }, 'dry-run': { type: 'boolean' } },
  strict: false,
});
if (values.emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = String(values.project ?? 'demo-rcpl-pod');
} else if (values.project) process.env.GCLOUD_PROJECT = String(values.project);
else {
  console.error('Specify --project <id> (or --emulator)');
  process.exit(1);
}

const STATUS_MAP: Record<string, string> = {
  UNDER_REVIEW: 'SUBMITTED',
  PENDING: 'SUBMITTED',
  APPROVED: 'FORWARDED_TO_BILLING',
  REJECTED: 'RESUBMISSION_REQUESTED',
};

(async () => {
  const { COL, db } = await import('../src/lib/admin');
  const { CATEGORIES } = await import('../src/lib/constants');
  const dry = !!values['dry-run'];
  const fallback = values['default-category'] ? String(values['default-category']).toUpperCase() : null;
  if (fallback && !(CATEGORIES as readonly string[]).includes(fallback)) throw new Error(`Unknown category ${fallback}. Use one of ${CATEGORIES.join(', ')}`);

  const vendors = await db.collection(COL.vendors).get();
  const vendorCats = new Map(vendors.docs.map((d) => [d.id, (d.get('categories') as string[] | undefined) ?? []]));
  const missing = vendors.docs.filter((d) => !vendorCats.get(d.id)!.length);

  let changed = 0;
  for (const s of (await db.collection(COL.submissions).get()).docs) {
    const d = s.data();
    const update: Record<string, unknown> = {};
    if (STATUS_MAP[d.currentStatus]) {
      update.currentStatus = STATUS_MAP[d.currentStatus];
      update.billingVisible = d.currentStatus === 'APPROVED';
      if (d.currentStatus === 'REJECTED') update.lastRemarks = d.adminRemarks ?? null;
    }
    if (d.billingVisible === undefined && update.billingVisible === undefined) update.billingVisible = false;
    let category = d.category as string | undefined;
    if (!category) {
      category = vendorCats.get(d.vendorId)?.[0] ?? fallback ?? undefined;
      if (!category) {
        console.warn(`  ! ${d.submissionNumber}: vendor has no categories — rerun with --default-category`);
        continue;
      }
      update.category = category;
    }
    if (!Object.keys(update).length) continue;
    changed++;
    console.info(`  ${d.submissionNumber}: ${JSON.stringify(update)}`);
    if (dry) continue;
    await s.ref.update(update);
    if (update.category) {
      for (const c of [COL.documents, COL.history]) {
        const kids = await db.collection(c).where('submissionId', '==', s.id).get();
        const batch = db.batch();
        kids.docs.forEach((k) => !k.get('category') && batch.update(k.ref, { category }));
        await batch.commit();
      }
    }
  }

  const staff = await db.collection(COL.userProfiles).where('role', 'in', ['ADMIN', 'CATEGORY', 'BILLING']).get();
  for (const p of staff.docs) {
    if (p.get('active') === undefined && !dry) await p.ref.update({ active: true, categories: p.get('categories') ?? [] });
  }

  console.info(`\n${dry ? '[dry run] ' : ''}${changed} submission(s) migrated; ${staff.size} staff profile(s) checked.`);
  if (missing.length) {
    console.info('\nVendors without categories (edit them in Admin → Vendors):');
    missing.forEach((v) => console.info(`  - ${v.get('vendorCode')} ${v.get('vendorName')}`));
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
