/**
 * Admin SDK bootstrap for CLI scripts (never bundled into the web app).
 *
 *   --emulator          use the local Emulator Suite (project demo-rcpl-pod)
 *   --project <id>      real project; credentials from Application Default
 *                       Credentials (`gcloud auth application-default login`)
 *                       or GOOGLE_APPLICATION_CREDENTIALS pointing at a key
 *                       file kept OUTSIDE the repository.
 */
import { parseArgs } from 'node:util';

export function initAdmin() {
  const { values } = parseArgs({
    options: {
      emulator: { type: 'boolean', default: false },
      project: { type: 'string' },
      email: { type: 'string' },
      password: { type: 'string' },
      name: { type: 'string' },
    },
    strict: false,
  });
  if (values.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
    process.env.GCLOUD_PROJECT = String(values.project ?? 'demo-rcpl-pod');
  } else if (values.project) {
    process.env.GCLOUD_PROJECT = String(values.project);
  }
  if (!process.env.GCLOUD_PROJECT) {
    console.error('Specify --emulator or --project <firebase-project-id>');
    process.exit(1);
  }
  return values as Record<string, string | boolean | undefined>;
}
