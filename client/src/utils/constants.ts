export const MAX_UPLOAD_MB = 10;
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
  'In case of rejection, upload the corrected document.',
];

export const PASSWORD_RULES: Array<[RegExp, string]> = [
  [/.{8,}/, 'At least 8 characters'],
  [/[A-Z]/, 'One uppercase letter'],
  [/[a-z]/, 'One lowercase letter'],
  [/[0-9]/, 'One number'],
  [/[^A-Za-z0-9]/, 'One special character'],
];
