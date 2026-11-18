import { FirebaseError } from 'firebase/app';

/** App-level error with a stable code and optional per-field messages. */
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: { fields?: Record<string, string>; [k: string]: unknown },
  ) {
    super(message);
  }
  get fields() {
    return this.details?.fields ?? {};
  }
}

const AUTH_MESSAGES: Record<string, [string, string?]> = {
  'auth/invalid-credential': ['Invalid email or password.'],
  'auth/wrong-password': ['Invalid email or password.'],
  'auth/user-not-found': ['Invalid email or password.'],
  'auth/invalid-email': ['Enter a valid email address.'],
  'auth/user-disabled': ['Your vendor account has been deactivated. Please contact the RCPL vendor administration team.', 'ACCOUNT_DEACTIVATED'],
  'auth/too-many-requests': ['Too many attempts. Please wait a few minutes and try again.'],
  'auth/network-request-failed': ['Unable to reach the server. Please check your connection.'],
  'auth/expired-action-code': ['This reset link has expired. Please request a new one.'],
  'auth/invalid-action-code': ['This reset link is invalid or has already been used.'],
  'auth/weak-password': ['Password does not meet the security requirements.'],
  'auth/password-does-not-meet-requirements': ['Password does not meet the security requirements.'],
};

/** Normalises Firebase Auth / Firestore / Storage / Functions errors. */
export function toAppError(err: unknown, fallback = 'Something went wrong. Please try again.'): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof FirebaseError) {
    const auth = AUTH_MESSAGES[err.code];
    if (auth) return new AppError(auth[0], auth[1] ?? err.code);
    if (err.code.startsWith('functions/')) {
      const details = (err as FirebaseError & { details?: { code?: string } }).details;
      const message = err.code === 'functions/internal' ? fallback : err.message;
      return new AppError(message, details?.code ?? err.code, details as AppError['details']);
    }
    if (err.code === 'permission-denied' || err.code === 'storage/unauthorized') {
      return new AppError('You do not have permission to access this information.', 'FORBIDDEN');
    }
    if (err.code === 'failed-precondition' && /index/i.test(err.message)) {
      return new AppError('The database index for this view is still being created. Please try again in a few minutes.', 'INDEX_BUILDING');
    }
    if (err.code === 'unavailable') return new AppError('Unable to reach the server. Please check your connection.', 'NETWORK');
    if (err.code === 'storage/object-not-found' || err.code === 'not-found') return new AppError('The requested record or file was not found.', 'NOT_FOUND');
  }
  return new AppError(fallback);
}
