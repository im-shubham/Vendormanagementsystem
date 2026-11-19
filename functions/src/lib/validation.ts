import { z } from 'zod';
import { invalid } from './errors';
import { CATEGORIES } from './constants';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) {
      const k = i.path.join('.') || '_';
      fields[k] ??= i.message;
    }
    throw invalid(Object.values(fields)[0] ?? 'Invalid input', fields);
  }
  return r.data;
}

const text = (label: string, max: number) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`);
const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const emailSchema = z.string({ error: 'Email is required' }).trim().toLowerCase().pipe(z.email('Enter a valid email address'));
export const vendorCodeSchema = z
  .string({ error: 'Vendor code is required' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,30}$/, 'Vendor code must be 2–30 letters, numbers, - or _');
export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

const todayIso = () => new Date().toISOString().slice(0, 10);
const deliveryDate = z
  .string({ error: 'Delivery date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Delivery date must be a valid date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Delivery date must be a valid date')
  // allow +1 day for timezone differences between client and server (UTC)
  .refine((v) => v <= new Date(Date.now() + 86400000).toISOString().slice(0, 10), 'Delivery date cannot be in the future');

export const docId = z.string().regex(/^[A-Za-z0-9]{10,40}$/, 'Invalid id');
export const uidSchema = z.string().regex(/^[A-Za-z0-9_-]{6,128}$/, 'Invalid user id');
export const categorySchema = z.enum(CATEGORIES, { error: 'Select a valid category' });
export const categoriesSchema = z
  .array(categorySchema, { error: 'Select at least one category' })
  .min(1, 'Select at least one category')
  .transform((a) => [...new Set(a)].sort());

export const schemas = {
  setupEmail: z.object({ email: emailSchema, vendorCode: vendorCodeSchema }),
  vendor: z.object({
    vendorName: text('Vendor name', 200),
    vendorCode: vendorCodeSchema,
    email: emailSchema,
    contactPerson: text('Contact person', 120),
    mobileNumber: z.string({ error: 'Mobile number is required' }).trim().regex(/^\+?[0-9][0-9\s-]{8,16}$/, 'Enter a valid mobile number'),
    address: text('Address', 500),
    categories: categoriesSchema,
  }),
  vendorUpdate: z.object({ vendorId: docId }),
  vendorRef: z.object({ vendorId: docId }),
  reviewRegistration: z.object({
    requestId: docId,
    decision: z.enum(['APPROVED', 'REJECTED']),
    remarks: optionalText(1000),
  }),
  createSubmission: z.object({
    submissionId: docId,
    vendorId: docId.optional(), // staff uploads on behalf of a vendor
    category: categorySchema,
    forwardNow: z.boolean().optional(), // staff only: forward straight to billing
    poNumber: text('PO Number', 50),
    invoiceNumber: text('Invoice Number', 50),
    deliveryDate,
    deliveryReference: optionalText(100),
  }),
  resubmit: z.object({
    submissionId: docId,
    poNumber: text('PO Number', 50).optional(),
    invoiceNumber: text('Invoice Number', 50).optional(),
    deliveryDate: deliveryDate.optional(),
    deliveryReference: optionalText(100).optional(),
    note: optionalText(500),
  }),
  podAction: z
    .object({ submissionId: docId, action: z.enum(['FORWARD', 'SEND_BACK', 'MARK_BILLED']), remarks: optionalText(1000) })
    .refine((d) => d.action !== 'SEND_BACK' || !!d.remarks, { path: ['remarks'], message: 'Please give a reason for sending it back' }),
  staffCreate: z
    .object({
      email: emailSchema,
      fullName: text('Full name', 120),
      role: z.enum(['ADMIN', 'CATEGORY', 'BILLING']),
      categories: z.array(categorySchema).default([]),
    })
    .refine((d) => d.role !== 'CATEGORY' || d.categories.length > 0, { path: ['categories'], message: 'Select at least one category' }),
  staffUpdate: z
    .object({
      uid: uidSchema,
      fullName: text('Full name', 120),
      role: z.enum(['ADMIN', 'CATEGORY', 'BILLING']),
      categories: z.array(categorySchema).default([]),
    })
    .refine((d) => d.role !== 'CATEGORY' || d.categories.length > 0, { path: ['categories'], message: 'Select at least one category' }),
  staffActive: z.object({ uid: uidSchema, active: z.boolean() }),
};

export { todayIso };
