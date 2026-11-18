import { Check } from 'lucide-react';
import clsx from 'clsx';
import type { Category } from '@/types';
import { CATEGORIES, categoryLabel } from '@/utils/constants';

/** Read-only category tags. */
export function CategoryTags({ categories, max = 3 }: { categories: Category[]; max?: number }) {
  if (!categories?.length) return <span className="text-slate-300">—</span>;
  const shown = categories.slice(0, max);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((c) => (
        <span key={c} className="rounded-md bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
          {categoryLabel(c)}
        </span>
      ))}
      {categories.length > max && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">+{categories.length - max}</span>}
    </span>
  );
}

/** Multi-select as toggle chips. */
export function CategoryPicker({
  value,
  onChange,
  label = 'Categories',
  error,
  options = CATEGORIES.map((c) => c.value),
  required,
}: {
  value: Category[];
  onChange: (v: Category[]) => void;
  label?: string;
  error?: string;
  options?: Category[];
  required?: boolean;
}) {
  const toggle = (c: Category) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div>
      <p className="label">
        {label}
        {required && <span className="ml-0.5 text-brand-red">*</span>}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((c) => {
          const on = value.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition',
                on ? 'bg-royal-800 text-white ring-royal-800' : 'bg-white text-slate-600 ring-slate-300 hover:ring-royal-400',
              )}
            >
              {on && <Check className="h-3.5 w-3.5" />}
              {categoryLabel(c)}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-sm text-brand-red">{error}</p>}
    </div>
  );
}
