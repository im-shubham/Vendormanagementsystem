/**
 * Seeds DEMO data: one admin login and a few vendor-master records
 * (status NOT_REGISTERED — vendors activate themselves via First-Time Login).
 * Never run against production.
 */
import { pool } from '../db/pool.js';
import { createAdmin } from './create-admin.js';

const ADMIN = { email: 'admin@rcpl.demo', password: 'Admin@12345', name: 'Admin User' };

const VENDORS = [
  ['V1001', 'ABC Foods Pvt. Ltd.', 'abcfoods@example.com', 'Rahul Sharma', '+91 98200 11111', 'Plot 12, MIDC Industrial Area, Navi Mumbai, Maharashtra 400710'],
  ['V1002', 'XYZ Agri Traders', 'xyzagri@example.com', 'Priya Patel', '+91 98200 22222', '45 APMC Market Yard, Ahmedabad, Gujarat 380022'],
  ['V1003', 'MNO Exports', 'mnoexports@example.com', 'Arjun Nair', '+91 98200 33333', '7 Port Road, Kochi, Kerala 682001'],
  ['V1004', 'Global Foods Ltd.', 'globalfoods@example.com', 'Sneha Reddy', '+91 98200 44444', '22 Food Park, Hyderabad, Telangana 500032'],
];

async function main() {
  const created = await createAdmin(ADMIN.email, ADMIN.password, ADMIN.name);
  console.info(created ? `✔ Demo admin: ${ADMIN.email} / ${ADMIN.password}` : `Demo admin ${ADMIN.email} already exists`);
  for (const [code, name, email, contact, mobile, address] of VENDORS) {
    const { rowCount } = await pool.query(
      `insert into public.vendors (vendor_code, vendor_name, email, contact_person, mobile_number, address)
       values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
      [code, name, email, contact, mobile, address],
    );
    console.info(rowCount ? `✔ Vendor ${code} ${name} <${email}>` : `Vendor ${code} already exists`);
  }
  console.info('\nVendors can now use "First-Time Login / Create Password" with their email + vendor code.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
