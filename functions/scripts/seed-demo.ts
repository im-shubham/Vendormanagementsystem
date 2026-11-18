/**
 * DEMO data for the Emulator Suite (or a sandbox project): one admin login
 * and four vendor-master records in NOT_REGISTERED status.
 *
 *   npm run seed:emulator          (from the repo root, emulators running)
 */
import { initAdmin } from './_init';

process.argv.push(...(process.argv.includes('--project') ? [] : ['--emulator']));
initAdmin();

const ADMIN = { email: 'admin@rcpl.demo', password: 'Admin@12345', name: 'Admin User' };
const STAFF = [
  { email: 'category.rice@rcpl.demo', password: 'Category@123', name: 'Rice & Pulses Team', role: 'CATEGORY' as const, categories: ['RICE', 'PULSES'] },
  { email: 'category.oils@rcpl.demo', password: 'Category@123', name: 'Edible Oils Team', role: 'CATEGORY' as const, categories: ['EDIBLE_OILS', 'GHEE'] },
  { email: 'billing@rcpl.demo', password: 'Billing@123', name: 'Billing Team', role: 'BILLING' as const, categories: [] },
];

const VENDORS: Array<[string, string, string, string, string, string, string[]]> = [
  ['V1001', 'ABC Foods Pvt. Ltd.', 'abcfoods@example.com', 'Rahul Sharma', '+91 98200 11111', 'Plot 12, MIDC Industrial Area, Navi Mumbai, Maharashtra 400710', ['RICE', 'PULSES']],
  ['V1002', 'XYZ Agri Traders', 'xyzagri@example.com', 'Priya Patel', '+91 98200 22222', '45 APMC Market Yard, Ahmedabad, Gujarat 380022', ['SUGAR', 'SALT']],
  ['V1003', 'MNO Exports', 'mnoexports@example.com', 'Arjun Nair', '+91 98200 33333', '7 Port Road, Kochi, Kerala 682001', ['SPICES', 'DRY_FRUITS']],
  ['V1004', 'Global Foods Ltd.', 'globalfoods@example.com', 'Sneha Reddy', '+91 98200 44444', '22 Food Park, Hyderabad, Telangana 500032', ['EDIBLE_OILS', 'GHEE', 'FLOUR']],
];

(async () => {
  const { createAdmin, createStaff } = await import('./admin-users');
  const { COL, FieldValue, db } = await import('../src/lib/admin');
  const { uniqueKey } = await import('../src/lib/keys');
  const { buildSearchKeywords } = await import('../src/lib/search');

  await createAdmin(ADMIN.email, ADMIN.password, ADMIN.name);
  console.info(`✔ Demo admin: ${ADMIN.email} / ${ADMIN.password}`);
  for (const u of STAFF) {
    await createStaff(u.email, u.password, u.name, u.role, u.categories);
    console.info(`✔ Demo ${u.role.toLowerCase()} user: ${u.email} / ${u.password}${u.categories.length ? ` (${u.categories.join(', ')})` : ''}`);
  }

  for (const [vendorCode, vendorName, email, contactPerson, mobileNumber, address, categories] of VENDORS) {
    const codeKey = uniqueKey.vendorCode(vendorCode);
    if ((await codeKey.get()).exists) {
      console.info(`  Vendor ${vendorCode} already exists`);
      continue;
    }
    const ref = db.collection(COL.vendors).doc();
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.create(codeKey, { kind: 'vendorCode', vendorId: ref.id });
    batch.create(uniqueKey.vendorEmail(email), { kind: 'vendorEmail', vendorId: ref.id });
    batch.create(ref, {
      vendorCode, vendorName, email, contactPerson, mobileNumber, address, categories,
      accountStatus: 'NOT_REGISTERED', authUid: null, registeredAt: null, createdAt: now, updatedAt: now, createdBy: 'seed',
      searchKeywords: buildSearchKeywords(vendorName, vendorCode, email, contactPerson),
    });
    await batch.commit();
    console.info(`✔ Vendor ${vendorCode} ${vendorName} <${email}>`);
  }
  console.info('\nVendors can now use "First-Time Login / Create Password" with their email + vendor code.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
