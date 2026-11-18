import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import { useNotifications } from '@/hooks/useNotifications';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { formatDateTime, timeAgo } from '@/utils/format';

export default function NotificationsPage() {
  const { items, unread, loading, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : 'You are all caught up.'}
        action={unread > 0 && <Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={markAllRead}>Mark all as read</Button>}
      />
      <Card className="overflow-hidden">
        {loading ? (
          <Spinner className="py-16" />
        ) : items.length === 0 ? (
          <EmptyState icon={<Bell className="h-7 w-7" />} title="No notifications yet" message="Status updates on your submissions will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    if (!n.isRead) void markRead(n.id);
                    if (n.link) navigate(n.link);
                  }}
                  className={clsx('flex w-full gap-4 px-5 py-4 text-left transition hover:bg-slate-50 sm:px-6', !n.isRead && 'bg-royal-50/40')}
                >
                  <span className={clsx('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', n.isRead ? 'bg-slate-200' : 'bg-brand-red')} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold text-slate-800">{n.title}</span>
                      <span className="text-xs text-slate-400" title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{n.message}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
