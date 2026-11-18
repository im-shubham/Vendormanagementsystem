import { logger } from 'firebase-functions';
import { COL, FieldValue, db } from './admin';
import type { Category } from './constants';

/**
 * In-app notifications (single place where notifications are created).
 * Future: add email / SMS / WhatsApp channels here.
 * Failures are logged and never undo a completed business action.
 */
interface Notice {
  title: string;
  message: string;
  link?: string | null;
}

async function send(userIds: string[], n: Notice) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  const batch = db.batch();
  for (const userId of unique) {
    batch.create(db.collection(COL.notifications).doc(), {
      userId,
      title: n.title,
      message: n.message,
      link: n.link ?? null,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

const safe = (label: string, fn: () => Promise<void>) =>
  fn().catch((err) => logger.error(`${label} failed`, err));

const activeIds = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.filter((d) => d.get('active') !== false).map((d) => d.id);

export const notifyVendor = (vendorId: string, n: Notice, exceptUid?: string) =>
  safe('notifyVendor', async () => {
    const snap = await db.collection(COL.userProfiles).where('vendorId', '==', vendorId).where('role', '==', 'VENDOR').get();
    await send(snap.docs.map((d) => d.id).filter((id) => id !== exceptUid), n);
  });

export const notifyCategory = (category: Category, n: Notice, exceptUid?: string) =>
  safe('notifyCategory', async () => {
    const snap = await db.collection(COL.userProfiles).where('role', '==', 'CATEGORY').where('categories', 'array-contains', category).get();
    await send(activeIds(snap).filter((id) => id !== exceptUid), n);
  });

export const notifyBilling = (n: Notice, exceptUid?: string) =>
  safe('notifyBilling', async () => {
    const snap = await db.collection(COL.userProfiles).where('role', '==', 'BILLING').get();
    await send(activeIds(snap).filter((id) => id !== exceptUid), n);
  });

export const notifyAdmins = (n: Notice) =>
  safe('notifyAdmins', async () => {
    const snap = await db.collection(COL.userProfiles).where('role', '==', 'ADMIN').get();
    await send(activeIds(snap), n);
  });
