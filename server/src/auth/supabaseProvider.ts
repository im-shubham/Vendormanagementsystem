import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthProvider, AuthSession } from './provider.js';
import { AuthProviderError } from './provider.js';

/**
 * Supabase Auth provider. Uses the service-role key ONLY on the server.
 * Passwords are hashed and stored by Supabase Auth (GoTrue).
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly name = 'supabase';
  private admin: SupabaseClient;

  constructor(private url: string, private serviceKey: string) {
    this.admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /** A throwaway client so sign-ins never share session state. */
  private ephemeral() {
    return createClient(this.url, this.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private toSession(s: { access_token: string; refresh_token: string; expires_in: number; user: { id: string } }): AuthSession {
    return { accessToken: s.access_token, refreshToken: s.refresh_token, expiresIn: s.expires_in, userId: s.user.id };
  }

  async createUser(email: string, password: string) {
    const { data, error } = await this.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      const msg = error?.message ?? 'Unable to create user';
      if (/already|registered|exists/i.test(msg)) throw new AuthProviderError('A login already exists for this email', 'EMAIL_EXISTS');
      if (/password/i.test(msg)) throw new AuthProviderError(msg, 'WEAK_PASSWORD');
      throw new AuthProviderError(msg);
    }
    return data.user.id;
  }

  async deleteUser(userId: string) {
    await this.admin.auth.admin.deleteUser(userId);
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.ephemeral().auth.signInWithPassword({ email, password });
    if (error || !data.session) return null;
    return this.toSession(data.session);
  }

  async refresh(refreshToken: string) {
    const { data, error } = await this.ephemeral().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return null;
    return this.toSession(data.session);
  }

  async verifyAccessToken(token: string) {
    const { data, error } = await this.admin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  }

  async sendPasswordReset(email: string, redirectTo: string) {
    // Supabase emails a link to redirectTo with #access_token=...&type=recovery
    await this.ephemeral().auth.resetPasswordForEmail(email, { redirectTo });
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const { data, error } = await this.admin.auth.getUser(resetToken);
    if (error || !data.user) throw new AuthProviderError('The reset link is invalid or has expired', 'INVALID_TOKEN');
    const { error: updErr } = await this.admin.auth.admin.updateUserById(data.user.id, { password: newPassword });
    if (updErr) throw new AuthProviderError(updErr.message, /password/i.test(updErr.message) ? 'WEAK_PASSWORD' : 'UNKNOWN');
  }

  async signOut(accessToken: string) {
    await this.admin.auth.admin.signOut(accessToken).catch(() => undefined);
  }
}
