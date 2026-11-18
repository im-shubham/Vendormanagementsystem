import { useCallback, useEffect, useState } from 'react';
import { notificationService } from '@/services/commonService';
import type { AppNotification } from '@/types';

const POLL_MS = 30_000;

/** In-app notifications with light polling (no realtime infra needed for MVP). */
export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await notificationService.list();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* keep last known state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('rcpl:notifications-changed', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('rcpl:notifications-changed', onFocus);
    };
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await notificationService.markRead(id).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    await notificationService.markAllRead().catch(() => undefined);
  }, []);

  return { items, unread, loading, refresh, markRead, markAllRead };
}

export const notifyNotificationsChanged = () => window.dispatchEvent(new Event('rcpl:notifications-changed'));
