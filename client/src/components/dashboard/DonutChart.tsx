import type { PodStats } from '@/types';
import { pct } from '@/utils/format';

const SEGMENTS: Array<{ key: keyof Omit<PodStats, 'total'>; label: string; color: string }> = [
  { key: 'APPROVED', label: 'Approved', color: '#16a34a' },
  { key: 'UNDER_REVIEW', label: 'Under Review', color: '#f5b400' },
  { key: 'REJECTED', label: 'Rejected', color: '#e31b23' },
  { key: 'PENDING', label: 'Pending', color: '#cbd5e1' },
];

/** POD status breakdown donut (pure SVG; values come from the API). */
export function DonutChart({ stats, centerLabel = 'Submissions' }: { stats: PodStats; centerLabel?: string }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const gap = stats.total > 0 && SEGMENTS.filter((s) => stats[s.key] > 0).length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
      <div className="relative h-44 w-44 shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label="POD submission status chart">
          <circle cx="90" cy="90" r={r} fill="none" stroke="#eef2f7" strokeWidth="22" />
          {stats.total > 0 &&
            SEGMENTS.map((s) => {
              const value = stats[s.key];
              if (!value) return null;
              const len = (value / stats.total) * c;
              const el = (
                <circle
                  key={s.key}
                  cx="90"
                  cy="90"
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="22"
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${s.label}: ${value}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold tabular-nums text-navy-900">{stats.total}</span>
          <span className="text-sm text-slate-500">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-3 sm:w-auto">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center gap-3 text-[15px] text-slate-700">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 whitespace-nowrap pr-2">{s.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{stats[s.key]}</span>
            <span className="w-12 text-right text-sm tabular-nums text-slate-500">({pct(stats[s.key], stats.total)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
