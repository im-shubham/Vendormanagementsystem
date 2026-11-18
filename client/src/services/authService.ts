import { confirmPasswordReset, sendPasswordResetEmail, signOut, verifyPasswordResetCode } from 'firebase/auth';
import { auth, callFn } from '@/lib/firebase';
import { toAppError } from '@/lib/errors';

const activateFn = callFn<{ email: string; vendorCode: string; password: string; confirmPassword: string }, { status: string; message: string }>('activateVendorAccount');

export const authService = {
  /** First-time activation runs in a Cloud Function (validates against the vendor master). */
  activate: async (data: { email: string; vendorCode: string; password: string; confirmPassword: string }) => {
    try {
      return await activateFn(data);
    } catch (e) {
      throw toAppError(e, 'Activation failed. Please try again.');
    }
  },
  forgotPassword: async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/login` });
    } catch (e) {
      const err = toAppError(e);
      // Don't reveal whether an account exists.
      if (err.code !== 'auth/user-not-found' && err.message !== 'Invalid email or password.') throw err;
    }
    return { message: 'If an account exists for this email, a password reset link has been sent.' };
  },
  verifyResetCode: async (oobCode: string) => {
    try {
      return await verifyPasswordResetCode(auth, oobCode);
    } catch (e) {
      throw toAppError(e);
    }
  },
  resetPassword: async (oobCode: string, password: string) => {
    try {
      await confirmPasswordReset(auth, oobCode, password);
    } catch (e) {
      throw toAppError(e);
    }
    return { message: 'Your password has been updated. You can now log in.' };
  },
  logout: () => signOut(auth),
};
