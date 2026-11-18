import { env } from '../config/env.js';
import type { AuthProvider } from './provider.js';
import { LocalAuthProvider } from './localProvider.js';
import { SupabaseAuthProvider } from './supabaseProvider.js';

export const authProvider: AuthProvider =
  env.AUTH_PROVIDER === 'supabase'
    ? new SupabaseAuthProvider(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
    : new LocalAuthProvider(env.LOCAL_JWT_SECRET!);

export * from './provider.js';
