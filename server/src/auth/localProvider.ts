import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import type { AuthProvider, AuthSession } from './provider.js';
import { AuthProviderError } from './provider.js';

const ACCESS_TTL = 60 * 60; // 1 hour
const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days
const RESET_TTL = 30 * 60; // 30 minutes

type TokenType = 'access' | 'refresh' | 'reset';

/**
 * Local development auth provider: bcrypt-hashed passwords in auth.users
 * (created by supabase/local/000_local_auth_shim.sql) and HS256 JWTs.
 * Tokens embed a fingerprint of the password hash, so changing the password
 * invalidates all existing refresh/reset tokens.
 */
export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local';
  constructor(private secret: string) {}

  private fingerprint(hash: string) {
    return hash.slice(-12);
  }

  private sign(userId: string, type: TokenType, ttl: number, fp: string) {
    return jwt.sign({ sub: userId, typ: type, fp, role: 'authenticated' }, this.secret, {
      expiresIn: ttl,
      algorithm: 'HS256',
    });
  }

  private async session(userId: string, hash: string): Promise<AuthSession> {
    const fp = this.fingerprint(hash);
    return {
      accessToken: this.sign(userId, 'access', ACCESS_TTL, fp),
      refreshToken: this.sign(userId, 'refresh', REFRESH_TTL, fp),
      expiresIn: ACCESS_TTL,
      userId,
    };
  }

  private async decode(token: string, type: TokenType): Promise<{ userId: string; hash: string } | null> {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      if (payload.typ !== type || typeof payload.sub !== 'string') return null;
      const { rows } = await pool.query('select encrypted_password from auth.users where id = $1', [payload.sub]);
      if (!rows[0] || this.fingerprint(rows[0].encrypted_password) !== payload.fp) return null;
      return { userId: payload.sub, hash: rows[0].encrypted_password };
    } catch {
      return null;
    }
  }

  async createUser(email: string, password: string) {
    const hash = await bcrypt.hash(password, 12);
    try {
      const { rows } = await pool.query(
        'insert into auth.users (email, encrypted_password) values (lower($1), $2) returning id',
        [email, hash],
      );
      return rows[0].id as string;
    } catch (err: any) {
      if (err.code === '23505') throw new AuthProviderError('A login already exists for this email', 'EMAIL_EXISTS');
      throw err;
    }
  }

  async deleteUser(userId: string) {
    await pool.query('delete from auth.users where id = $1', [userId]);
  }

  async signIn(email: string, password: string) {
    const { rows } = await pool.query('select id, encrypted_password from auth.users where email = lower($1)', [email]);
    const user = rows[0];
    // Always run bcrypt to keep timing similar for unknown users
    const ok = await bcrypt.compare(password, user?.encrypted_password ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!user || !ok) return null;
    return this.session(user.id, user.encrypted_password);
  }

  async refresh(refreshToken: string) {
    const decoded = await this.decode(refreshToken, 'refresh');
    return decoded ? this.session(decoded.userId, decoded.hash) : null;
  }

  async verifyAccessToken(token: string) {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      return payload.typ === 'access' && typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  async sendPasswordReset(email: string, redirectTo: string) {
    const { rows } = await pool.query('select id, encrypted_password from auth.users where email = lower($1)', [email]);
    if (!rows[0]) return;
    const token = this.sign(rows[0].id, 'reset', RESET_TTL, this.fingerprint(rows[0].encrypted_password));
    // No email service in local mode: print the link for the developer.
    console.info(`[local-auth] Password reset link for ${email}: ${redirectTo}#access_token=${token}&type=recovery`);
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const decoded = await this.decode(resetToken, 'reset');
    if (!decoded) throw new AuthProviderError('The reset link is invalid or has expired', 'INVALID_TOKEN');
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('update auth.users set encrypted_password = $2, updated_at = now() where id = $1', [decoded.userId, hash]);
  }

  async signOut() {
    // Stateless tokens; client discards them. Changing password revokes refresh tokens.
  }
}
