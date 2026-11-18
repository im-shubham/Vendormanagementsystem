import { CheckCircle2, Info } from 'lucide-react';
import { POD_GUIDELINES } from '@/utils/constants';

export function GuidelinesCard({ compact }: { compact?: boolean }) {
  return (
    <section className="rounded-2xl border border-royal-100 bg-gradient-to-br from-royal-50/70 to-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-royal-800">
        <Info className="h-5 w-5" /> Important Guidelines
      </h2>
      <ul className={compact ? 'mt-3 space-y-2' : 'mt-4 space-y-3'}>
        {POD_GUIDELINES.map((g) => (
          <li key={g} className="flex items-start gap-2.5 text-sm text-slate-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            {g}
          </li>
        ))}
      </ul>
    </section>
  );
}
