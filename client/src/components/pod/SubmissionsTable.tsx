import { Link } from 'react-router-dom';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { Role, Submission } from '@/types';
import { categoryLabel } from '@/utils/constants';
import { formatDate, formatDateTime } from '@/utils/format';
import { PodStatusBadge } from '../ui/StatusBadge';

interface Props {
  items: Submission[];
  basePath: string; // '/vendor/submissions' | '/admin/submissions'
  viewer: Role;
  showVendor?: boolean;
  showRemarks?: boolean;
  /** Dashboard widget: PO/Invoice merged, no delivery-date column. */
  compact?: boolean;
}

/** Whether `viewer` has the next action on this submission. */
export function needsAction(s: Submission, viewer: Role) {
  if (viewer === 'VENDOR') return s.status === 'RESUBMISSION_REQUESTED';
  if (viewer === 'CATEGORY') return s.status === 'SUBMITTED' || s.status === 'RESUBMISSION_REQUESTED';
  if (viewer === 'BILLING') return s.status === 'FORWARDED_TO_BILLING';
  return s.status === 'SUBMITTED' || s.status === 'FORWARDED_TO_BILLING';
}

function ActionLink({ s, basePath, viewer }: { s: Submission; basePath: string; viewer: Role }) {
  const to = `${basePath}/${s.id}`;
  if (viewer === 'VENDOR' && s.status === 'RESUBMISSION_REQUESTED')
    return (
      <Link to={`${to}?reupload=1`} className="inline-flex items-center gap-1 rounded-lg bg-brand-red px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-red-dark">
        <RotateCcw className="h-3.5 w-3.5" /> Re-upload
      </Link>
    );
  if (viewer !== 'VENDOR' && needsAction(s, viewer))
    return (
      <Link to={to} className="inline-flex items-center gap-1 rounded-lg bg-royal-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-royal-700">
        {s.status === 'RESUBMISSION_REQUESTED' ? 'Upload copy' : 'Review'}
      </Link>
    );
  return (
    <Link to={to} className="inline-flex items-center gap-1 rounded-lg bg-royal-50 px-3 py-1.5 text-sm font-semibold text-royal-800 hover:bg-royal-100">
      View
    </Link>
  );
}

export function SubmissionsTable({ items, basePath, viewer, showVendor, showRemarks, compact }: Props) {
  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full">
          <thead>
            <tr className="border-y border-slate-100">
              <th className="th">Submission ID</th>
              {showVendor && <th className="th">Vendor</th>}
              <th className="th">Category</th>
              {compact ? (
                <th className="th">PO / Invoice</th>
              ) : (
                <>
                  <th className="th">PO Number</th>
                  <th className="th">Invoice Number</th>
                  <th className="th">Delivery Date</th>
                </>
              )}
              <th className="th">Submitted On</th>
              <th className="th">Status</th>
              {showRemarks && <th className="th">Remarks</th>}
              <th className="th text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((s) => (
              <tr key={s.id} className="transition hover:bg-slate-50/70">
                <td className="td">
                  <Link to={`${basePath}/${s.id}`} className="link">
                    {s.submissionNumber}
                  </Link>
                  {s.currentVersion > 1 && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">v{s.currentVersion}</span>}
                </td>
                {showVendor && (
                  <td className="td max-w-[220px]">
                    <span className="block truncate font-medium text-slate-800" title={s.vendorName}>{s.vendorName}</span>
                    <span className="block text-xs text-slate-400">{s.vendorCode}</span>
                  </td>
                )}
                <td className="td">
                  <span className="rounded-md bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-700">{categoryLabel(s.category)}</span>
                </td>
                {compact ? (
                  <td className="td">
                    <span className="font-medium text-slate-800">{s.poNumber}</span>
                    <span className="block text-xs text-slate-400">{s.invoiceNumber}</span>
                  </td>
                ) : (
                  <>
                    <td className="td font-medium">{s.poNumber}</td>
                    <td className="td">{s.invoiceNumber}</td>
                    <td className="td">{formatDate(s.deliveryDate)}</td>
                  </>
                )}
                <td className="td">{compact ? formatDate(s.submittedAt) : formatDateTime(s.submittedAt)}</td>
                <td className="td">
                  <PodStatusBadge status={s.status} />
                </td>
                {showRemarks && (
                  <td className="td max-w-[240px] whitespace-normal text-sm">
                    {s.status === 'RESUBMISSION_REQUESTED' && s.lastRemarks ? <span className="text-red-700">{s.lastRemarks}</span> : <span className="text-slate-300">—</span>}
                  </td>
                )}
                <td className="td text-right">
                  <ActionLink s={s} basePath={basePath} viewer={viewer} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {items.map((s) => (
          <li key={s.id} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`${basePath}/${s.id}`} className="link">
                  {s.submissionNumber}
                </Link>
                {showVendor && <p className="truncate text-sm font-medium text-slate-700">{s.vendorName}</p>}
                <p className="mt-0.5 text-sm text-slate-600">
                  {categoryLabel(s.category)} · {s.poNumber} · {s.invoiceNumber}
                </p>
                <p className="text-xs text-slate-400">
                  Delivered {formatDate(s.deliveryDate)} · Submitted {formatDate(s.submittedAt)}
                </p>
              </div>
              <PodStatusBadge status={s.status} />
            </div>
            {showRemarks && s.lastRemarks && s.status === 'RESUBMISSION_REQUESTED' && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{s.lastRemarks}</p>}
            <div className="mt-3 flex justify-end">
              <ActionLink s={s} basePath={basePath} viewer={viewer} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ViewAllLink({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 rounded-lg bg-royal-50 px-3 py-1.5 text-sm font-semibold text-royal-800 hover:bg-royal-100">
      View All <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
