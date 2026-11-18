import { COL, FieldValue, adminAuth, db } from '../src/lib/admin';
import { emailSchema, passwordSchema } from '../src/lib/validation';

/** Creates (or promotes) an admin login with the ADMIN custom claim. */
export async function createAdmin(email: string, password: string | undefined, name: string) {
  const e = emailSchema.parse(email);
  let uid: string;
  let created = false;
  try {
    uid = (await adminAuth.getUserByEmail(e)).uid;
  } catch {
    if (!password) throw new Error('--password is required for a new admin');
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) throw new Error(pw.error.issues[0].message);
    uid = (await adminAuth.createUser({ email: e, password, displayName: name, emailVerified: true })).uid;
    created = true;
  }
  const existing = await db.collection(COL.userProfiles).doc(uid).get();
  if (existing.exists && existing.get('role') === 'VENDOR') throw new Error(`${e} is a vendor login and cannot be made an admin.`);
  await adminAuth.setCustomUserClaims(uid, { role: 'ADMIN' });
  await db.collection(COL.userProfiles).doc(uid).set(
    { role: 'ADMIN', vendorId: null, fullName: name, email: e, createdAt: existing.exists ? existing.get('createdAt') : FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { uid, created };
}
