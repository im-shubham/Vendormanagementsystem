import { CheckCircle2, Hourglass, RotateCcw, Upload, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { StatusHistoryEntry } from '@/types';
import { formatDateTime } from '@/utils/format';

export function StatusTimeline({ history }: { history: StatusHistoryEntry[] }) {
  return (
    <ol className="relative space-y-5 border-l-2 border-slate-100 pl-6">
      {history.map((h) => {
        const resubmit = h.previousStatus === 'REJECTED' && h.newStatus === 'UNDER_REVIEW';
        const first = h.previousStatus === null;
        const { Icon, cls } =
          h.newStatus === 'APPROVED'
            ? { Icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700' }
            : h.newStatus === 'REJECTED'
              ? { Icon: XCircle, cls: 'bg-red-100 text-brand-red' }
              : resubmit
                ? { Icon: RotateCcw, cls: 'bg-royal-100 text-royal-700' }
                : first
                  ? { Icon: Upload, cls: 'bg-royal-100 text-royal-700' }
                  : { Icon: Hourglass, cls: 'bg-amber-100 text-amber-700' };
        const title =
          h.newStatus === 'APPROVED' ? 'Approved' : h.newStatus === 'REJECTED' ? 'Rejected' : resubmit ? 'Re-submitted' : first ? 'Submitted' : 'Under review';
        return (
          <li key={h.id} className="relative">
            <span className={clsx('absolute -left-[37px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-white', cls)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="font-semibold text-slate-800">{title}</p>
              {h.versionNumber && <span className="text-xs font-medium text-slate-400">v{h.versionNumber}</span>}
            </div>
            <p className="text-xs text-slate-500">
              {formatDateTime(h.updatedAt)}
              {h.updatedByName && ` · ${h.updatedByRole === 'ADMIN' ? 'RCPL Admin' : h.updatedByName}`}
            </p>
            {h.remarks && (
              <p className={clsx('mt-1.5 rounded-lg px-3 py-2 text-sm', h.newStatus === 'REJECTED' ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700')}>
                {h.remarks}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
