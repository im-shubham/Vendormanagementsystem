import { z } from 'zod';
import { badRequest } from './httpError.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw badRequest(Object.values(fields)[0] ?? 'Invalid input', { fields });
  }
  return result.data;
}

const trimmed = (label: string, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

export const emailSchema = z.string({ error: 'Email is required' }).trim().toLowerCase().pipe(z.email('Enter a valid email address'));
export const vendorCodeSchema = z
  .string({ error: 'Vendor code is required' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,30}$/, 'Vendor code must be 2–30 letters, numbers, - or _');

export const isoDate = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} must be a valid date`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const schemas = {
  login: z.object({
    identifier: trimmed('Email or User ID', 254),
    password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
    portal: z.enum(['vendor', 'admin']),
  }),
  activate: z
    .object({
      email: emailSchema,
      vendorCode: vendorCodeSchema,
      password: passwordSchema,
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' }),
  forgot: z.object({ email: emailSchema }),
  reset: z
    .object({ token: z.string().min(10, 'Invalid reset link'), password: passwordSchema, confirmPassword: z.string() })
    .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' }),
  refresh: z.object({ refreshToken: z.string().min(10) }),

  vendor: z.object({
    vendorName: trimmed('Vendor name', 200),
    vendorCode: vendorCodeSchema,
    email: emailSchema,
    contactPerson: trimmed('Contact person', 120),
    mobileNumber: z
      .string({ error: 'Mobile number is required' })
      .trim()
      .regex(/^\+?[0-9][0-9\s-]{8,16}$/, 'Enter a valid mobile number'),
    address: trimmed('Address', 500),
  }),
  podSubmission: z.object({
    poNumber: trimmed('PO Number', 50),
    invoiceNumber: trimmed('Invoice Number', 50),
    deliveryDate: isoDate('Delivery date').refine((v) => v <= new Date().toISOString().slice(0, 10), 'Delivery date cannot be in the future'),
    deliveryReference: optionalText(100),
  }),
  reupload: z.object({
    poNumber: trimmed('PO Number', 50).optional(),
    invoiceNumber: trimmed('Invoice Number', 50).optional(),
    deliveryDate: isoDate('Delivery date')
      .refine((v) => v <= new Date().toISOString().slice(0, 10), 'Delivery date cannot be in the future')
      .optional(),
    deliveryReference: optionalText(100),
    note: optionalText(500),
  }),
  review: z.object({ remarks: optionalText(1000) }),
  reject: z.object({ remarks: trimmed('Rejection remarks', 1000) }),
  regReject: z.object({ remarks: optionalText(1000) }),
};

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().max(30).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  po: z.string().trim().max(50).optional(),
  vendorId: z.uuid().optional(),
});
export type ListQuery = z.infer<typeof listQuery>;
