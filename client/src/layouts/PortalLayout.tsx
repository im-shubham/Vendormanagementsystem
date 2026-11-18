import { useEffect, useRef, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, ChevronDown, ClipboardCheck, FileText, HelpCircle, Home, LogOut, Menu, UploadCloud, UserPlus, Users, X,
} from 'lucide-react';
import clsx from 'clsx';
import { Logo } from '@/components/brand/Logo';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useAuth } from '@/context/AuthContext';
import { adminService } from '@/services/adminService';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: number;
}

const VENDOR_NAV: NavItem[] = [
  { to: '/vendor', label: 'Dashboard', icon: Home, end: true },
  { to: '/vendor/upload', label: 'Upload POD', icon: UploadCloud },
  { to: '/vendor/submissions', label: 'My Submissions', icon: FileText },
  { to: '/vendor/notifications', label: 'Notifications', icon: Bell },
  { to: '/vendor/help', label: 'Help & Support', icon: HelpCircle },
];

function useAdminCounts(enabled: boolean) {
  const [counts, setCounts] = useState({ review: 0, registrations: 0 });
  const location = useLocation();
  useEffect(() => {
    if (!enabled) return;
    adminService
      .dashboard()
      .then((d) => setCounts({ review: d.pods.UNDER_REVIEW, registrations: d.vendors.pendingApproval }))
      .catch(() => undefined);
  }, [enabled, location.pathname]);
  return counts;
}

export function PortalLayout({ portal }: { portal: 'vendor' | 'admin' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const counts = useAdminCounts(portal === 'admin');

  const nav: NavItem[] =
    portal === 'vendor'
      ? VENDOR_NAV
      : [
          { to: '/admin', label: 'Dashboard', icon: Home, end: true },
          { to: '/admin/submissions', label: 'POD Verifications', icon: ClipboardCheck, badge: counts.review },
          { to: '/admin/vendors', label: 'Vendors', icon: Users },
          { to: '/admin/registrations', label: 'Registration Requests', icon: UserPlus, badge: counts.registrations },
          { to: '/admin/notifications', label: 'Notifications', icon: Bell },
        ];

  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const displayName = (portal === 'vendor' ? user?.vendor?.name : user?.fullName) ?? user?.email ?? '';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';

  const doLogout = async () => {
    await logout();
    navigate(portal === 'admin' ? '/admin/login' : '/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col overflow-hidden bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900">
      <div className="rounded-br-[2.25rem] bg-white px-6 pb-5 pt-5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <Logo className="mx-auto w-[190px]" />
      </div>
      {portal === 'admin' && <p className="px-7 pb-1 pt-6 text-xl font-bold text-white">Admin Portal</p>}
      <nav className={clsx('flex-1 space-y-1.5 overflow-y-auto px-4', portal === 'admin' ? 'pt-3' : 'pt-7')} aria-label="Main">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3.5 rounded-xl px-4 py-3 text-[15px] font-medium transition',
                isActive ? 'bg-royal-600 text-white shadow-lg shadow-royal-900/40' : 'text-navy-100 hover:bg-white/10 hover:text-white',
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {!!item.badge && <span className="rounded-full bg-brand-red px-2 py-0.5 text-xs font-bold text-white">{item.badge}</span>}
          </NavLink>
        ))}
      </nav>
      {portal === 'admin' && (
        <div className="relative z-10 mx-4 mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-navy-950/70 px-3 py-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-royal-100 font-bold text-royal-800">{initial}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{displayName}</p>
            <p className="text-xs text-navy-200">RCPL</p>
          </div>
          <button onClick={doLogout} className="rounded-lg p-2 text-navy-200 hover:bg-white/10 hover:text-white" aria-label="Log out" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Brand wave */}
      <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="pointer-events-none -mt-16 h-28 w-full shrink-0" aria-hidden>
        <path d="M0,70 C90,30 190,40 300,0 L300,120 L0,120 Z" fill="#1f43c9" opacity="0.55" />
        <path d="M0,95 C110,60 200,80 300,40 L300,120 L0,120 Z" fill="#e31b23" />
      </svg>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] animate-fade-in">
            {sidebar}
            <button onClick={() => setDrawer(false)} className="absolute right-3 top-3 rounded-lg bg-white/90 p-2 text-slate-600" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </aside>
        </div>
      )}

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex h-[72px] items-center gap-3 px-4 sm:px-6 lg:h-[88px] lg:px-8">
            <button onClick={() => setDrawer(true)} className="-ml-1 rounded-lg p-2 text-navy-800 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold text-navy-900 sm:text-2xl lg:text-[28px]">
                {portal === 'vendor' ? 'Vendor POD Portal' : 'POD Management – Admin'}
              </p>
              <p className="hidden truncate text-sm text-slate-500 sm:block">
                {portal === 'vendor'
                  ? 'Upload and track Proof of Delivery (POD) for your dispatches'
                  : 'Verify, track and manage Proof of Delivery (POD) submissions from vendors'}
              </p>
            </div>
            <NotificationBell allPath={`/${portal}/notifications`} />
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <div ref={menuRef} className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={menu}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-royal-800 text-base font-bold text-white">{initial}</span>
                <span className="hidden max-w-[180px] truncate text-[15px] font-semibold text-navy-900 md:block">{displayName}</span>
                <ChevronDown className="hidden h-4 w-4 text-slate-500 md:block" />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 top-14 z-40 w-64 animate-fade-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate font-semibold text-slate-800">{displayName}</p>
                    <p className="truncate text-sm text-slate-500">{user?.email}</p>
                    {user?.vendor && <p className="mt-1 text-xs font-medium text-slate-400">Vendor code: {user.vendor.code}</p>}
                  </div>
                  <button role="menuitem" onClick={doLogout} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-brand-red hover:bg-red-50">
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
