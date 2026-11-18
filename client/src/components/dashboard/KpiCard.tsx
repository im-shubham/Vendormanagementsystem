import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

export type KpiTone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate';

const tones: Record<KpiTone, { card: string; icon: string }> = {
  blue: { card: 'bg-gradient-to-br from-royal-50 to-white border-royal-100', icon: 'bg-royal-100 text-royal-700' },
  green: { card: 'bg-gradient-to-br from-emerald-50 to-white border-emerald-100', icon: 'bg-emerald-100 text-emerald-700' },
  amber: { card: 'bg-gradient-to-br from-amber-50 to-white border-amber-100', icon: 'bg-amber-100 text-amber-600' },
  red: { card: 'bg-gradient-to-br from-red-50 to-white border-red-100', icon: 'bg-red-100 text-brand-red' },
  violet: { card: 'bg-gradient-to-br from-violet-50 to-white border-violet-100', icon: 'bg-violet-100 text-violet-700' },
  slate: { card: 'bg-gradient-to-br from-slate-100 to-white border-slate-200', icon: 'bg-slate-200 text-slate-600' },
};

interface Props {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone: KpiTone;
  to?: string;
  hint?: string;
}

export function KpiCard({ label, value, icon, tone, to, hint }: Props) {
  const t = tones[tone];
  const body = (
    <div className={clsx('flex h-full items-center gap-4 rounded-2xl border p-4 shadow-card transition 2xl:p-5', t.card, to && 'hover:shadow-card-hover')}>
      <div className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-xl 2xl:h-14 2xl:w-14', t.icon)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug text-slate-600">{label}</p>
        <p className="text-2xl font-extrabold tabular-nums text-navy-900 sm:text-[28px]">{value}</p>
        {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}
