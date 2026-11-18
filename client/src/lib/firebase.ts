import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

/**
 * Firebase web configuration comes from Vite env variables (client/.env.local).
 * These values identify the project; they are NOT secrets — access is enforced
 * by Firebase Auth + Security Rules + Cloud Functions. Never put Admin SDK /
 * service-account credentials in the web app.
 */
const env = import.meta.env;
export const USE_EMULATORS = env.VITE_USE_FIREBASE_EMULATORS === 'true';

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (USE_EMULATORS ? 'demo-key' : ''),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || (USE_EMULATORS ? 'demo-rcpl-pod' : ''),
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || (USE_EMULATORS ? 'demo-rcpl-pod.appspot.com' : ''),
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

if (!config.apiKey || !config.projectId) {
  // eslint-disable-next-line no-console
  console.error('Firebase is not configured. Copy client/.env.example to client/.env.local and fill in your project settings.');
}

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-south1');

if (USE_EMULATORS) {
  const host = env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
  connectFunctionsEmulator(functions, host, 5001);
}

/** Typed wrapper for callable Cloud Functions. */
export function callFn<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req) => (await fn(data)).data;
}
