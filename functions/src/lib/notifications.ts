import { logger } from 'firebase-functions';
import { COL, FieldValue, db } from './admin';

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
  if (!userIds.length) return;
  const batch = db.batch();
  for (const userId of userIds) {
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

export async function notifyVendor(vendorId: string, n: Notice) {
  try {
    const snap = await db.collection(COL.userProfiles).where('vendorId', '==', vendorId).where('role', '==', 'VENDOR').get();
    await send(snap.docs.map((d) => d.id), n);
  } catch (err) {
    logger.error('notifyVendor failed', err);
  }
}

export async function notifyAdmins(n: Notice) {
  try {
    const snap = await db.collection(COL.userProfiles).where('role', '==', 'ADMIN').get();
    await send(snap.docs.map((d) => d.id), n);
  } catch (err) {
    logger.error('notifyAdmins failed', err);
  }
}
