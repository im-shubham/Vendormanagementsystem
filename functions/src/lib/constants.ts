/**
 * Business constants shared by all Cloud Functions.
 * (The web app keeps an identical copy in client/src/utils/constants.ts.)
 */
export const CATEGORIES = [
  'RICE', 'SUGAR', 'FLOUR', 'SPICES', 'EDIBLE_OILS', 'PULSES', 'SALT', 'GHEE', 'DRY_FRUITS', 'CEREALS',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  RICE: 'Rice', SUGAR: 'Sugar', FLOUR: 'Flour', SPICES: 'Spices', EDIBLE_OILS: 'Edible Oils',
  PULSES: 'Pulses', SALT: 'Salt', GHEE: 'Ghee', DRY_FRUITS: 'Dry Fruits', CEREALS: 'Cereals',
};

export const ROLES = ['ADMIN', 'CATEGORY', 'BILLING', 'VENDOR'] as const;
export type Role = (typeof ROLES)[number];
export type StaffRole = Exclude<Role, 'VENDOR'>;

/**
 * POD lifecycle (no approve / reject):
 *   SUBMITTED              with the category team
 *   RESUBMISSION_REQUESTED sent back — vendor or category uploads a new copy
 *   FORWARDED_TO_BILLING   with the billing team
 *   BILLED                 processed by billing (final)
 */
export const POD_STATUSES = ['SUBMITTED', 'RESUBMISSION_REQUESTED', 'FORWARDED_TO_BILLING', 'BILLED'] as const;
export type PodStatus = (typeof POD_STATUSES)[number];

export const STATUS_LABELS: Record<PodStatus, string> = {
  SUBMITTED: 'With Category Team',
  RESUBMISSION_REQUESTED: 'Re-upload Requested',
  FORWARDED_TO_BILLING: 'With Billing',
  BILLED: 'Billed',
};
