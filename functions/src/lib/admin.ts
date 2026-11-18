import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const adminAuth = getAuth();
export const bucket = () => getStorage().bucket();
export { FieldValue, Timestamp };

/** Collection names — single source of truth. */
export const COL = {
  vendors: 'vendors',
  userProfiles: 'userProfiles',
  registrations: 'vendorRegistrationRequests',
  submissions: 'podSubmissions',
  documents: 'podDocuments',
  history: 'podStatusHistory',
  notifications: 'notifications',
  counters: 'counters',
  uniqueKeys: 'uniqueKeys',
} as const;

export const STORAGE_ROOT = 'pod-documents';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
