import { confirmPasswordReset, sendPasswordResetEmail, signOut, verifyPasswordResetCode } from 'firebase/auth';
import { auth, callFn } from '@/lib/firebase';
import { toAppError } from '@/lib/errors';

const setupEmailFn = callFn<{ email: string; vendorCode: string }, { email: string }>('requestVendorSetupEmail');

export const authService = {
  /**
   * New vendor didn't get the "set your password" email: verify registered
   * email + vendor code, then Firebase Auth sends the email again.
   */
  requestSetupEmail: async (email: string, vendorCode: string) => {
    try {
      const r = await setupEmailFn({ email, vendorCode });
      await sendPasswordResetEmail(auth, r.email, { url: `${window.location.origin}/login` });
      return r;
    } catch (e) {
      throw toAppError(e, 'Could not send the email. Please try again.');
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
