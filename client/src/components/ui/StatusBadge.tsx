import { Ban, CheckCircle2, Clock, Hourglass, UserCheck, UserX, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { PodStatus, RegistrationStatus, VendorAccountStatus } from '@/types';

const base = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset';

const POD: Record<PodStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  APPROVED: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 },
  UNDER_REVIEW: { label: 'Under Review', cls: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: Hourglass },
  REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-200', Icon: XCircle },
  PENDING: { label: 'Pending', cls: 'bg-slate-100 text-slate-600 ring-slate-200', Icon: Clock },
};

export function PodStatusBadge({ status, className }: { status: PodStatus; className?: string }) {
  const s = POD[status];
  return (
    <span className={clsx(base, s.cls, className)}>
      <s.Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

const ACCOUNT: Record<VendorAccountStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  ACTIVE: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: UserCheck },
  PENDING_APPROVAL: { label: 'Pending Approval', cls: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: Hourglass },
  NOT_REGISTERED: { label: 'Not Registered', cls: 'bg-slate-100 text-slate-600 ring-slate-200', Icon: Clock },
  REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-200', Icon: UserX },
  DEACTIVATED: { label: 'Deactivated', cls: 'bg-slate-200 text-slate-700 ring-slate-300', Icon: Ban },
};

export function AccountStatusBadge({ status }: { status: VendorAccountStatus }) {
  const s = ACCOUNT[status];
  return (
    <span className={clsx(base, s.cls)}>
      <s.Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

const REG: Record<RegistrationStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: Hourglass },
  APPROVED: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-200', Icon: XCircle },
};

export function RegistrationStatusBadge({ status }: { status: RegistrationStatus }) {
  const s = REG[status];
  return (
    <span className={clsx(base, s.cls)}>
      <s.Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

export const POD_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PENDING', label: 'Pending' },
];

export const ACCOUNT_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'NOT_REGISTERED', label: 'Not Registered' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DEACTIVATED', label: 'Deactivated' },
];
