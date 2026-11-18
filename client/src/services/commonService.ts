import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getBlob, ref } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { toAppError } from '@/lib/errors';
import { toNotification } from './mappers';
import type { AppNotification, PodDocument } from '@/types';

export const notificationService = {
  /** Realtime subscription to the signed-in user's notifications. */
  subscribe(uid: string, cb: (items: AppNotification[]) => void, onError?: (e: unknown) => void) {
    const q = query(collection(db, 'notifications'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => cb(snap.docs.map(toNotification)), onError);
  },
  markRead: (id: string) => updateDoc(doc(db, 'notifications', id), { isRead: true }),
  async markAllRead(ids: string[]) {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.update(doc(db, 'notifications', id), { isRead: true }));
    await batch.commit();
  },
};

/**
 * Documents are read with the user's credentials through Storage security
 * rules (getBlob). We never create public download URLs.
 */
export const documentService = {
  async fetch(d: PodDocument) {
    try {
      return await getBlob(ref(storage, d.storagePath));
    } catch (e) {
      throw toAppError(e, 'Unable to load document.');
    }
  },
  async download(d: PodDocument) {
    const blob = await documentService.fetch(d);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = d.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
