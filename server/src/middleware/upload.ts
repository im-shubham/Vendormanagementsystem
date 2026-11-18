import multer from 'multer';
import path from 'node:path';
import { MAX_UPLOAD_BYTES } from '../config/env.js';
import { badRequest } from '../utils/httpError.js';

export const ALLOWED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

export const podUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 2, fields: 20 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ALLOWED_TYPES[file.mimetype];
    if (!allowed || !allowed.includes(ext)) {
      return cb(badRequest(`"${file.originalname}" is not allowed. Accepted formats: PDF, JPG, JPEG, PNG.`));
    }
    cb(null, true);
  },
}).fields([
  { name: 'podDocument', maxCount: 1 },
  { name: 'supportingPhoto', maxCount: 1 },
]);

/** Verify file content matches its declared type (basic magic-byte check). */
export function assertFileSignature(file: Express.Multer.File) {
  const b = file.buffer;
  const ok =
    (file.mimetype === 'application/pdf' && b.subarray(0, 5).toString('latin1') === '%PDF-') ||
    (file.mimetype === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (file.mimetype === 'image/png' && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  if (!ok) throw badRequest(`"${file.originalname}" appears to be corrupted or is not a genuine ${file.mimetype} file.`);
}
