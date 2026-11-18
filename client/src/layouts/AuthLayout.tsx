import type { ReactNode } from 'react';
import { Bell, ClipboardCheck, BarChart3, ShieldCheck, UploadCloud, Users } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import warehouse from '@/assets/warehouse.jpg';

const VENDOR_FEATURES = [
  { icon: UploadCloud, label: 'Upload POD & Invoices' },
  { icon: ClipboardCheck, label: 'Real-time Status Tracking' },
  { icon: Bell, label: 'Get Notifications & Updates' },
  { icon: BarChart3, label: 'View Delivery History' },
];
const ADMIN_FEATURES = [
  { icon: ClipboardCheck, label: 'Verify POD Submissions' },
  { icon: Users, label: 'Manage Vendor Master' },
  { icon: ShieldCheck, label: 'Approve Vendor Registrations' },
  { icon: BarChart3, label: 'Track Delivery Compliance' },
];

export function AuthLayout({ children, variant = 'vendor' }: { children: ReactNode; variant?: 'vendor' | 'admin' }) {
  const features = variant === 'admin' ? ADMIN_FEATURES : VENDOR_FEATURES;
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-royal-50/60">
      {/* decorative brand curves */}
      <div className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-brand-red/90 blur-0 lg:-right-24 lg:-top-48" aria-hidden />
      <div className="pointer-events-none absolute -bottom-48 -right-32 h-96 w-[34rem] rounded-full bg-royal-100/70" aria-hidden />

      <div className="relative grid min-h-screen lg:grid-cols-[minmax(0,44%)_1fr]">
        {/* Brand panel */}
        <aside className="relative hidden flex-col overflow-hidden rounded-r-[4.5rem] bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 text-white lg:flex">
          <div className="relative z-10 px-12 pt-10 xl:px-16">
            <div className="inline-block rounded-2xl bg-white px-6 py-4 shadow-xl">
              <Logo className="w-[200px]" />
            </div>
            <div className="mt-8 h-1.5 w-14 rounded-full bg-brand-red" />
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight xl:text-[44px]">{variant === 'admin' ? 'POD Admin Portal' : 'Vendor POD Portal'}</h1>
            <p className="mt-3 max-w-md text-lg leading-relaxed text-navy-100">
              {variant === 'admin'
                ? 'Verify, track and manage Proof of Delivery submissions from RCPL vendors.'
                : 'Upload, track and manage Proof of Delivery (POD) seamlessly.'}
            </p>
            <ul className="mt-8 space-y-4">
              {features.map((f) => (
                <li key={f.label} className="flex items-center gap-4 text-[17px]">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                    <f.icon className="h-6 w-6" />
                  </span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-auto">
            <div className="absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-navy-800 to-transparent" />
            <img src={warehouse} alt="" className="block h-auto w-full object-cover" />
            <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="absolute bottom-0 right-0 h-16 w-2/3" aria-hidden>
              <path d="M0,80 C150,70 280,40 400,0 L400,80 Z" fill="#e31b23" />
            </svg>
          </div>
        </aside>

        {/* Form panel */}
        <main className="relative z-10 flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[560px] rounded-[1.75rem] border border-slate-200/70 bg-white/95 px-6 py-8 shadow-[0_20px_60px_rgba(15,31,90,0.12)] sm:px-12 sm:py-12">
            <Logo className="mx-auto w-[200px] sm:w-[230px]" />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
