import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { notificationService } from '@/services/commonService';
import type { AppNotification } from '@/types';

/** Realtime in-app notifications (Firestore onSnapshot). */
export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    return notificationService.subscribe(
      user.uid,
      (list) => {
        setItems(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = items.filter((n) => !n.isRead).length;
  const markRead = useCallback(async (id: string) => {
    await notificationService.markRead(id).catch(() => undefined);
  }, []);
  const markAllRead = useCallback(async () => {
    await notificationService.markAllRead(items.filter((n) => !n.isRead).map((n) => n.id)).catch(() => undefined);
  }, [items]);

  return { items, unread, loading, markRead, markAllRead };
}

/** Kept for API compatibility — notifications update in realtime now. */
export const notifyNotificationsChanged = () => undefined;
