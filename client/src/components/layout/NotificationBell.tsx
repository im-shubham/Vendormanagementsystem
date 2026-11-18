import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import { useNotifications } from '@/hooks/useNotifications';
import { timeAgo } from '@/utils/format';

export function NotificationBell({ allPath }: { allPath: string }) {
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-11 w-11 place-items-center rounded-xl text-navy-800 hover:bg-slate-100"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-red px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[68px] z-40 animate-fade-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-bold text-navy-900">Notifications</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="inline-flex items-center gap-1 text-sm font-semibold text-royal-700 hover:underline">
                <CheckCheck className="h-4 w-4" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</li>}
            {items.slice(0, 8).map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    if (!n.isRead) void markRead(n.id);
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                  className={clsx('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50', !n.isRead && 'bg-royal-50/50')}
                >
                  <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : 'bg-brand-red')} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{n.title}</span>
                    <span className="line-clamp-2 block text-sm text-slate-600">{n.message}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to={allPath} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-royal-700 hover:bg-slate-50">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
