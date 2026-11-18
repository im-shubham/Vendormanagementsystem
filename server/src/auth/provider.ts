/**
 * Authentication provider abstraction. The API never stores passwords
 * itself when using Supabase; the local provider exists so the system can be
 * developed and demonstrated against a plain PostgreSQL database.
 */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  userId: string;
}

export interface AuthProvider {
  readonly name: string;
  /** Create a confirmed user with a password. Returns the auth user id. */
  createUser(email: string, password: string): Promise<string>;
  /** Delete a user (used to roll back a failed activation). */
  deleteUser(userId: string): Promise<void>;
  /** Password sign-in. Returns null when credentials are wrong. */
  signIn(email: string, password: string): Promise<AuthSession | null>;
  /** Exchange a refresh token for a new session. Returns null if invalid. */
  refresh(refreshToken: string): Promise<AuthSession | null>;
  /** Validate an access token and return the auth user id, or null. */
  verifyAccessToken(token: string): Promise<string | null>;
  /** Start a password reset (sends an email / logs a dev link). */
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  /** Complete a password reset using the token from the reset link. */
  resetPassword(resetToken: string, newPassword: string): Promise<void>;
  /** Revoke sessions (best effort). */
  signOut(accessToken: string): Promise<void>;
}

export class AuthProviderError extends Error {
  constructor(message: string, public code: 'EMAIL_EXISTS' | 'WEAK_PASSWORD' | 'INVALID_TOKEN' | 'UNKNOWN' = 'UNKNOWN') {
    super(message);
  }
}
