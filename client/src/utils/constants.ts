import type { Category, PodStatus, Role } from '@/types';

export const MAX_UPLOAD_MB = 10;

/** Staples categories (must match functions/src/lib/constants.ts). */
export const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'RICE', label: 'Rice' },
  { value: 'SUGAR', label: 'Sugar' },
  { value: 'FLOUR', label: 'Flour' },
  { value: 'SPICES', label: 'Spices' },
  { value: 'EDIBLE_OILS', label: 'Edible Oils' },
  { value: 'PULSES', label: 'Pulses' },
  { value: 'SALT', label: 'Salt' },
  { value: 'GHEE', label: 'Ghee' },
  { value: 'DRY_FRUITS', label: 'Dry Fruits' },
  { value: 'CEREALS', label: 'Cereals' },
];
export const categoryLabel = (c?: string | null) => CATEGORIES.find((x) => x.value === c)?.label ?? c ?? '—';

export const STATUS_LABELS: Record<PodStatus, string> = {
  SUBMITTED: 'With Category Team',
  RESUBMISSION_REQUESTED: 'Re-upload Requested',
  FORWARDED_TO_BILLING: 'With Billing',
  BILLED: 'Billed',
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  CATEGORY: 'Category Team',
  BILLING: 'Billing Team',
  VENDOR: 'Vendor',
};
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const ACCEPTED_POD_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};
export const ACCEPTED_PHOTO_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'vendor.support@rcpl.example';

export const POD_GUIDELINES = [
  'Upload a clear and complete POD document.',
  'Ensure all document edges are visible.',
  'Receiving stamp/seal must be visible.',
  'Signature and delivery details must be readable.',
  'Upload the correct document against the relevant delivery.',
  'If a POD is sent back, upload a new copy against the same submission.',
];

export const PASSWORD_RULES: Array<[RegExp, string]> = [
  [/.{8,}/, 'At least 8 characters'],
  [/[A-Z]/, 'One uppercase letter'],
  [/[a-z]/, 'One lowercase letter'],
  [/[0-9]/, 'One number'],
  [/[^A-Za-z0-9]/, 'One special character'],
];
