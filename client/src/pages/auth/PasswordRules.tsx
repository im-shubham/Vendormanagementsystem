import { Check, Circle } from 'lucide-react';
import clsx from 'clsx';
import { PASSWORD_RULES } from '@/utils/constants';

export const passwordValid = (pw: string) => PASSWORD_RULES.every(([re]) => re.test(pw));

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 rounded-xl bg-slate-50 px-4 py-3 sm:grid-cols-2">
      {PASSWORD_RULES.map(([re, label]) => {
        const ok = re.test(password);
        return (
          <li key={label} className={clsx('flex items-center gap-2 text-xs', ok ? 'text-emerald-700' : 'text-slate-500')}>
            {ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
            {label}
          </li>
        );
      })}
    </ul>
  );
}
