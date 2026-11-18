import { onCall } from 'firebase-functions/https';
import { logger } from 'firebase-functions';
import { COL, FieldValue, adminAuth, db } from '../lib/admin';
import { ACCOUNT_MESSAGES, conflict, denied, invalid } from '../lib/errors';
import { buildSearchKeywords } from '../lib/search';
import { notify } from '../lib/notifications';
import type { Category } from '../lib/constants';
import { parse, schemas } from '../lib/validation';

/**
 * First-time vendor activation (unauthenticated callable).
 *
 * 1. Vendor supplies registered email + vendor code + new password.
 * 2. The vendor master record must exist with BOTH values and be NOT_REGISTERED.
 * 3. A Firebase Auth user is created (Firebase stores the password hash —
 *    never Firestore), with server-set custom claims {role: VENDOR, vendorId}.
 * 4. userProfile + registration request are created and the vendor becomes
 *    PENDING_APPROVAL. Nothing is accessible until an admin approves.
 */
export const activateVendorAccount = onCall(async (req) => {
  const { email, vendorCode, password } = parse(schemas.activate, req.data);

  const match = await db.collection(COL.vendors).where('email', '==', email).where('vendorCode', '==', vendorCode).limit(1).get();
  if (match.empty) {
    throw invalid('No vendor record matches this email and vendor code. Please check the details or contact the RCPL vendor administration team.');
  }
  const vendorRef = match.docs[0].ref;
  const vendor = match.docs[0].data();
  switch (vendor.accountStatus) {
    case 'NOT_REGISTERED':
      break;
    case 'PENDING_APPROVAL':
      throw conflict('This account has already been activated and is awaiting administrator approval.', 'ALREADY_ACTIVATED');
    case 'ACTIVE':
      throw conflict('This account is already active. Please log in or use "Forgot Password".', 'ALREADY_ACTIVATED');
    default: {
      const m = ACCOUNT_MESSAGES[vendor.accountStatus as keyof typeof ACCOUNT_MESSAGES];
      throw denied(m.message, m.code);
    }
  }

  let uid: string;
  try {
    const user = await adminAuth.createUser({ email, password, displayName: vendor.vendorName, emailVerified: false });
    uid = user.uid;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-exists') throw conflict('A login already exists for this email. Please log in or use "Forgot Password".', 'ALREADY_ACTIVATED');
    if (err?.code === 'auth/invalid-password' || err?.code === 'auth/password-does-not-meet-requirements') throw invalid(err.message);
    throw err;
  }

  try {
    await adminAuth.setCustomUserClaims(uid, { role: 'VENDOR', vendorId: vendorRef.id });
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(vendorRef);
      if (fresh.get('accountStatus') !== 'NOT_REGISTERED' || fresh.get('authUid')) throw conflict('This account has already been activated.', 'ALREADY_ACTIVATED');
      const now = FieldValue.serverTimestamp();
      tx.create(db.collection(COL.userProfiles).doc(uid), {
        role: 'VENDOR',
        vendorId: vendorRef.id,
        fullName: vendor.vendorName,
        email,
        createdAt: now,
      });
      tx.create(db.collection(COL.registrations).doc(), {
        vendorId: vendorRef.id,
        vendorName: vendor.vendorName,
        vendorCode: vendor.vendorCode,
        email,
        contactPerson: vendor.contactPerson ?? null,
        mobileNumber: vendor.mobileNumber ?? null,
        categories: (vendor.categories as Category[] | undefined) ?? [],
        approvalStatus: 'PENDING',
        requestedAt: now,
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        remarks: null,
        searchKeywords: buildSearchKeywords(vendor.vendorName, vendor.vendorCode, email),
      });
      tx.update(vendorRef, { accountStatus: 'PENDING_APPROVAL', authUid: uid, registeredAt: now, updatedAt: now });
    });
  } catch (err) {
    await adminAuth.deleteUser(uid).catch((e) => logger.error('Rollback of auth user failed', e));
    throw err;
  }

  const notice = {
    title: 'New vendor registration',
    message: `${vendor.vendorName} (${vendor.vendorCode}) has activated their account and is awaiting approval.`,
    link: '/admin/registrations',
  };
  // Approval request: admins + category teams of the vendor's categories (in-app + email)
  await notify({ admins: true, categories: (vendor.categories as Category[] | undefined) ?? [] }, { ...notice, title: 'Vendor approval request' });

  return { status: 'PENDING_APPROVAL', message: ACCOUNT_MESSAGES.PENDING_APPROVAL.message };
});

