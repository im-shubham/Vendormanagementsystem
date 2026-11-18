import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { MAX_UPLOAD_BYTES } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Endpoint not found', code: 'NOT_FOUND' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large. Maximum size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected file field.'
          : err.message;
    return res.status(400).json({ error: { message, code: 'UPLOAD_ERROR' } });
  }
  // PostgreSQL errors
  if (typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
    if (err.code === '23505') return res.status(409).json({ error: { message: 'A record with these details already exists.', code: 'CONFLICT' } });
    if (err.code === '42501') return res.status(403).json({ error: { message: 'You do not have permission to perform this action.', code: 'FORBIDDEN' } });
    if (err.code === '22023' || err.code === '23514') return res.status(400).json({ error: { message: err.message, code: 'BAD_REQUEST' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Malformed JSON body', code: 'BAD_REQUEST' } });
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' } });
}
