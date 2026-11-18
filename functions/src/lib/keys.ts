import { createHash } from 'node:crypto';
import { COL, db } from './admin';

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 40);

/** Server-only uniqueness keys (Firestore has no unique constraints). */
export const uniqueKey = {
  vendorCode: (code: string) => db.collection(COL.uniqueKeys).doc(`vendorCode_${code.toUpperCase()}`),
  vendorEmail: (email: string) => db.collection(COL.uniqueKeys).doc(`vendorEmail_${sha(email.toLowerCase())}`),
  invoice: (vendorId: string, invoice: string) => db.collection(COL.uniqueKeys).doc(`invoice_${vendorId}_${sha(invoice.trim().toLowerCase())}`),
};
