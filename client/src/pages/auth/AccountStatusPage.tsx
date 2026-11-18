import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Ban, Hourglass, Mail, UserX } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { SUPPORT_EMAIL } from '@/utils/constants';

const VIEWS = {
  ACCOUNT_PENDING: {
    Icon: Hourglass,
    tone: 'bg-amber-50 text-amber-500 ring-amber-50/60',
    title: 'Awaiting Approval',
    message: 'Your account is awaiting administrator approval.',
    detail: 'RCPL is verifying your registration. You will be able to log in as soon as it is approved.',
  },
  ACCOUNT_REJECTED: {
    Icon: UserX,
    tone: 'bg-red-50 text-brand-red ring-red-50/60',
    title: 'Registration Not Approved',
    message: 'Your registration request was not approved.',
    detail: 'If you believe this is a mistake, please contact the RCPL vendor administration team.',
  },
  ACCOUNT_DEACTIVATED: {
    Icon: Ban,
    tone: 'bg-slate-100 text-slate-600 ring-slate-100/60',
    title: 'Account Deactivated',
    message: 'Your vendor account has been deactivated.',
    detail: 'Please contact the RCPL vendor administration team to restore access.',
  },
} as const;

const fromStatus: Record<string, keyof typeof VIEWS> = {
  PENDING_APPROVAL: 'ACCOUNT_PENDING',
  REJECTED: 'ACCOUNT_REJECTED',
  DEACTIVATED: 'ACCOUNT_DEACTIVATED',
};

export default function AccountStatusPage() {
  const state = (useLocation().state ?? {}) as { code?: string; vendorName?: string; vendorCode?: string };
  const key = (state.code && (state.code in VIEWS ? state.code : fromStatus[state.code])) as keyof typeof VIEWS | undefined;
  const v = VIEWS[key ?? 'ACCOUNT_PENDING'];
  const subject = encodeURIComponent(`Vendor portal access${state.vendorCode ? ` – ${state.vendorCode}` : ''}`);

  return (
    <AuthLayout>
      <div className="mt-8 text-center">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ring-8 ${v.tone}`}>
          <v.Icon className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-navy-900">{v.title}</h1>
        {state.vendorName && (
          <p className="mt-1 text-sm font-medium text-slate-500">
            {state.vendorName}
            {state.vendorCode && ` · ${state.vendorCode}`}
          </p>
        )}
        <p className="mx-auto mt-4 max-w-sm text-[17px] font-semibold text-slate-800">{v.message}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{v.detail}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {key !== 'ACCOUNT_PENDING' && (
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-royal-800 px-5 font-semibold text-white hover:bg-royal-700">
              <Mail className="h-4 w-4" /> Contact Admin
            </a>
          )}
          <Link to="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 font-semibold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-400">
          Support: <a className="link font-medium" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </div>
    </AuthLayout>
  );
}
