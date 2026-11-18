import { Readable } from 'node:stream';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StorageProvider } from './provider.js';

/**
 * Supabase Storage in a PRIVATE bucket. Files are only ever streamed through
 * the API after an authorisation check — no public or long-lived URLs.
 */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'supabase';
  private client: SupabaseClient;
  constructor(url: string, serviceKey: string, private bucket: string, private maxBytes: number) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async init() {
    const { data } = await this.client.storage.getBucket(this.bucket);
    if (!data) {
      const { error } = await this.client.storage.createBucket(this.bucket, {
        public: false,
        fileSizeLimit: this.maxBytes,
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      });
      if (error && !/already exists/i.test(error.message)) throw error;
    }
  }

  async put(path: string, data: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(this.bucket).upload(path, data, { contentType, upsert: false });
    if (error) throw error;
  }

  async get(path: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) throw error ?? new Error('File not found');
    return Readable.from(Buffer.from(await data.arrayBuffer()));
  }

  async remove(path: string) {
    await this.client.storage.from(this.bucket).remove([path]);
  }
}
