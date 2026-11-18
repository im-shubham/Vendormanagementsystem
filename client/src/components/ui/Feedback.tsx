import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Inbox, Loader2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2 text-slate-500', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin text-royal-600" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function PageLoader() {
  return <Spinner className="min-h-[50vh]" label="Loading…" />;
}

type AlertKind = 'error' | 'success' | 'info' | 'warning';
export function Alert({ kind = 'info', title, children, className }: { kind?: AlertKind; title?: string; children?: ReactNode; className?: string }) {
  const map = {
    error: { cls: 'border-red-200 bg-red-50 text-red-800', Icon: AlertCircle },
    success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
    info: { cls: 'border-royal-200 bg-royal-50 text-royal-900', Icon: Info },
    warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-xl border px-4 py-3 text-sm', map.cls, className)}>
      <map.Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-red-50 p-3">
        <AlertCircle className="h-6 w-6 text-brand-red" />
      </div>
      <p className="max-w-md text-sm text-slate-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, message, action, icon }: { title: string; message?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 rounded-2xl bg-slate-100 p-3.5 text-slate-400">{icon ?? <Inbox className="h-7 w-7" />}</div>
      <p className="font-semibold text-slate-800">{title}</p>
      {message && <p className="max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
