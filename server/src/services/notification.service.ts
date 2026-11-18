import { pool, type Db } from '../db/pool.js';

/**
 * In-app notifications. Inserted from the system context because the
 * recipient is usually not the caller. Failures are logged, never thrown,
 * so a notification problem can't undo a completed business action.
 * (Future: plug email/SMS channels in here.)
 */
interface NotificationInput {
  title: string;
  message: string;
  link?: string | null;
}

async function insertFor(whereSql: string, params: unknown[], n: NotificationInput) {
  try {
    const i = params.length;
    await pool.query(
      `insert into public.notifications (user_id, title, message, link)
       select id, $${i + 1}, $${i + 2}, $${i + 3}
         from public.user_profiles where ${whereSql}`,
      [...params, n.title, n.message, n.link ?? null],
    );
  } catch (err) {
    console.error('Failed to create notification', err);
  }
}

export const notify = {
  vendor: (vendorId: string, n: NotificationInput) => insertFor(`vendor_id = $1 and role = 'VENDOR'`, [vendorId], n),
  admins: (n: NotificationInput) => insertFor(`role = 'ADMIN'`, [], n),
};

export const mapNotification = (r: any) => ({
  id: r.id,
  title: r.title,
  message: r.message,
  link: r.link,
  isRead: r.is_read,
  createdAt: r.created_at,
});

/** Runs in user context — RLS restricts rows to the caller. */
export async function listNotifications(db: Db, limit = 30) {
  const { rows } = await db.query(
    `select id, title, message, link, is_read, created_at
       from public.notifications order by created_at desc limit $1`,
    [limit],
  );
  const { rows: c } = await db.query(`select count(*)::int as unread from public.notifications where not is_read`);
  return { items: rows.map(mapNotification), unread: c[0].unread as number };
}
