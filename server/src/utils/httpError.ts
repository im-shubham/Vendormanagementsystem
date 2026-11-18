export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You do not have permission to perform this action', code = 'FORBIDDEN') =>
  new HttpError(403, msg, code);
export const notFound = (msg = 'Resource not found') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string) => new HttpError(409, msg, 'CONFLICT');
