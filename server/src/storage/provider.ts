import type { Readable } from 'node:stream';

/**
 * Storage abstraction for POD documents. Swap the implementation to move to
 * an RCPL-approved store (e.g. Azure Blob, S3, on-prem DMS) without touching
 * the business logic.
 */
export interface StorageProvider {
  readonly name: string;
  init(): Promise<void>;
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<Readable>;
  remove(path: string): Promise<void>;
}
