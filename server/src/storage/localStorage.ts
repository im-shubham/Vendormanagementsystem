import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageProvider } from './provider.js';

/** Development-only storage on the API server's disk (outside any public folder). */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private root: string;
  constructor(dir: string) {
    this.root = path.resolve(dir);
  }

  private resolve(p: string) {
    const full = path.resolve(this.root, p);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage path');
    return full;
  }

  async init() {
    await fsp.mkdir(this.root, { recursive: true });
  }

  async put(p: string, data: Buffer) {
    const full = this.resolve(p);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, data, { flag: 'wx' }); // never overwrite
  }

  async get(p: string): Promise<Readable> {
    const full = this.resolve(p);
    await fsp.access(full);
    return fs.createReadStream(full);
  }

  async remove(p: string) {
    await fsp.rm(this.resolve(p), { force: true });
  }
}
