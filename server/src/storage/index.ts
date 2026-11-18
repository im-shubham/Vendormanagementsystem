import { env, MAX_UPLOAD_BYTES } from '../config/env.js';
import type { StorageProvider } from './provider.js';
import { LocalStorageProvider } from './localStorage.js';
import { SupabaseStorageProvider } from './supabaseStorage.js';

export const storage: StorageProvider =
  env.STORAGE_PROVIDER === 'supabase'
    ? new SupabaseStorageProvider(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, env.SUPABASE_STORAGE_BUCKET, MAX_UPLOAD_BYTES)
    : new LocalStorageProvider(env.LOCAL_STORAGE_DIR);

export type { StorageProvider } from './provider.js';
