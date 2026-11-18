import { ReceiptText, RotateCcw, Send, Upload } from 'lucide-react';
import clsx from 'clsx';
import type { StatusHistoryEntry } from '@/types';
import { ROLE_LABELS } from '@/utils/constants';
import { formatDateTime } from '@/utils/format';

const META = {
  SUBMITTED: { Icon: Upload, cls: 'bg-amber-100 text-amber-700' },
  RESUBMISSION_REQUESTED: { Icon: RotateCcw, cls: 'bg-red-100 text-brand-red' },
  FORWARDED_TO_BILLING: { Icon: Send, cls: 'bg-royal-100 text-royal-700' },
  BILLED: { Icon: ReceiptText, cls: 'bg-emerald-100 text-emerald-700' },
} as const;

function title(h: StatusHistoryEntry) {
  if (h.newStatus === 'SUBMITTED') return h.previousStatus ? 'New copy uploaded' : 'POD uploaded';
  if (h.newStatus === 'RESUBMISSION_REQUESTED') return 'Sent back for a new copy';
  if (h.newStatus === 'FORWARDED_TO_BILLING') return 'Forwarded to billing';
  return 'Marked as billed';
}

export function StatusTimeline({ history }: { history: StatusHistoryEntry[] }) {
  return (
    <ol className="relative space-y-5 border-l-2 border-slate-100 pl-6">
      {history.map((h) => {
        const m = META[h.newStatus] ?? META.SUBMITTED;
        return (
          <li key={h.id} className="relative">
            <span className={clsx('absolute -left-[37px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-white', m.cls)}>
              <m.Icon className="h-4 w-4" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="font-semibold text-slate-800">{title(h)}</p>
              {h.versionNumber && <span className="text-xs font-medium text-slate-400">v{h.versionNumber}</span>}
            </div>
            <p className="text-xs text-slate-500">
              {formatDateTime(h.updatedAt)}
              {h.updatedByName && ` · ${h.updatedByName}`}
              {h.updatedByRole && ` (${ROLE_LABELS[h.updatedByRole]})`}
            </p>
            {h.remarks && (
              <p className={clsx('mt-1.5 rounded-lg px-3 py-2 text-sm', h.newStatus === 'RESUBMISSION_REQUESTED' ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700')}>
                {h.remarks}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
