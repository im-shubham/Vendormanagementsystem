import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/https';

/** All errors carry a stable machine code in `details.code` for the UI. */
export const fail = (code: FunctionsErrorCode, message: string, appCode?: string, extra?: Record<string, unknown>) =>
  new HttpsError(code, message, { code: appCode ?? code.toUpperCase().replace(/-/g, '_'), ...extra });

export const invalid = (message: string, fields?: Record<string, string>) => fail('invalid-argument', message, 'VALIDATION', fields ? { fields } : undefined);
export const denied = (message = 'You do not have permission to perform this action.', appCode = 'FORBIDDEN') => fail('permission-denied', message, appCode);
export const notFound = (message = 'Record not found.') => fail('not-found', message, 'NOT_FOUND');
export const conflict = (message: string, appCode = 'CONFLICT') => fail('failed-precondition', message, appCode);
export const alreadyExists = (message: string) => fail('already-exists', message, 'ALREADY_EXISTS');

export const ACCOUNT_MESSAGES = {
  PENDING_APPROVAL: { code: 'ACCOUNT_PENDING', message: 'Your account is awaiting administrator approval.' },
  REJECTED: { code: 'ACCOUNT_REJECTED', message: 'Your registration request was not approved. Please contact the RCPL vendor administration team.' },
  DEACTIVATED: { code: 'ACCOUNT_DEACTIVATED', message: 'Your vendor account has been deactivated. Please contact the RCPL vendor administration team.' },
  NOT_REGISTERED: { code: 'ACCOUNT_NOT_REGISTERED', message: 'Please complete first-time account activation.' },
} as const;
