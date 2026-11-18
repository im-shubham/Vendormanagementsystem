import { logger } from 'firebase-functions';
import { MAX_UPLOAD_BYTES, STORAGE_ROOT, bucket } from './admin';
import { invalid } from './errors';

export type DocumentType = 'POD' | 'SUPPORTING_PHOTO';

export interface VerifiedFile {
  documentType: DocumentType;
  storagePath: string;
  fileName: string; // original name supplied by the uploader (display only)
  contentType: string;
  size: number;
}

const EXT_TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const FILE_RE = /^(pod-document\.(pdf|jpg|jpeg|png)|supporting-photo\.(jpg|jpeg|png))$/;

export const versionPrefix = (vendorId: string, submissionId: string, version: number) =>
  `${STORAGE_ROOT}/${vendorId}/${submissionId}/version-${version}/`;

function signatureOk(contentType: string, b: Buffer) {
  if (contentType === 'application/pdf') return b.subarray(0, 5).toString('latin1') === '%PDF-';
  if (contentType === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (contentType === 'image/png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

const sanitize = (name: unknown, fallback: string) =>
  (typeof name === 'string' ? name : fallback).replace(/[^\w.\- ()]/g, '_').slice(0, 150) || fallback;

/**
 * Inspects the files the vendor uploaded (directly to Storage, enforced by
 * storage.rules) for one submission version, and validates them server-side:
 * exactly one POD document, at most one supporting photo, size, type and
 * file signature. Invalid uploads are deleted.
 */
export async function verifyVersionFolder(vendorId: string, submissionId: string, version: number): Promise<VerifiedFile[]> {
  const prefix = versionPrefix(vendorId, submissionId, version);
  const [files] = await bucket().getFiles({ prefix });
  const problems: string[] = [];
  const verified: VerifiedFile[] = [];

  for (const file of files) {
    const name = file.name.slice(prefix.length);
    if (!FILE_RE.test(name)) {
      problems.push(`Unexpected file "${name}".`);
      continue;
    }
    const [meta] = await file.getMetadata();
    const size = Number(meta.size);
    const ext = name.split('.').pop()!;
    const contentType = String(meta.contentType ?? '');
    if (contentType !== EXT_TYPES[ext]) problems.push(`"${name}" has an invalid file type.`);
    if (!(size > 0 && size <= MAX_UPLOAD_BYTES)) problems.push(`"${name}" exceeds the 10 MB limit.`);
    const [head] = await file.download({ start: 0, end: 7 });
    if (!signatureOk(contentType, head)) problems.push('The uploaded file appears to be corrupted or is not a genuine PDF/JPG/PNG.');
    verified.push({
      documentType: name.startsWith('pod-document') ? 'POD' : 'SUPPORTING_PHOTO',
      storagePath: file.name,
      fileName: sanitize(meta.metadata?.originalName, name),
      contentType,
      size,
    });
  }

  const pods = verified.filter((f) => f.documentType === 'POD');
  const photos = verified.filter((f) => f.documentType === 'SUPPORTING_PHOTO');
  if (pods.length === 0) problems.push('Please upload the POD document.');
  if (pods.length > 1 || photos.length > 1) problems.push('Only one POD document and one supporting photo are allowed per version.');

  if (problems.length) {
    await deleteVersionFolder(vendorId, submissionId, version);
    throw invalid(problems[0]);
  }
  return verified;
}

export async function deleteVersionFolder(vendorId: string, submissionId: string, version: number) {
  try {
    await bucket().deleteFiles({ prefix: versionPrefix(vendorId, submissionId, version) });
  } catch (err) {
    logger.warn('Could not clean up uploaded files', err);
  }
}
