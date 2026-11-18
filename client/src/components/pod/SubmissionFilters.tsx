import { Search, X } from 'lucide-react';
import { POD_STATUS_OPTIONS } from '../ui/StatusBadge';

export interface FilterValues {
  search: string;
  status: string;
  from: string;
  to: string;
}

export const emptyFilters: FilterValues = { search: '', status: '', from: '', to: '' };

export function SubmissionFilters({
  values,
  onChange,
  searchPlaceholder = 'Search PO number',
}: {
  values: FilterValues;
  onChange: (v: FilterValues) => void;
  searchPlaceholder?: string;
}) {
  const set = (k: keyof FilterValues) => (e: { target: { value: string } }) => onChange({ ...values, [k]: e.target.value });
  const dirty = Object.values(values).some(Boolean);
  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={values.search} onChange={set('search')} placeholder={searchPlaceholder} className="field pl-10" aria-label={searchPlaceholder} />
      </div>
      <select value={values.status} onChange={set('status')} className="field" aria-label="Status">
        {POD_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="relative">
        <span className="pointer-events-none absolute -top-2 left-3 bg-white px-1 text-[11px] font-semibold text-slate-400">From</span>
        <input type="date" value={values.from} max={values.to || undefined} onChange={set('from')} className="field" aria-label="Submitted from" />
      </label>
      <label className="relative">
        <span className="pointer-events-none absolute -top-2 left-3 bg-white px-1 text-[11px] font-semibold text-slate-400">To</span>
        <input type="date" value={values.to} min={values.from || undefined} onChange={set('to')} className="field" aria-label="Submitted to" />
      </label>
      <button
        type="button"
        disabled={!dirty}
        onClick={() => onChange(emptyFilters)}
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        <X className="h-4 w-4" /> Clear
      </button>
    </div>
  );
}
