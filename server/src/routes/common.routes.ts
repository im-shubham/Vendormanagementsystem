import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { withUser } from '../db/pool.js';
import { authenticate, requireActiveVendor } from '../middleware/auth.js';
import { listNotifications } from '../services/notification.service.js';
import { getDocumentForDownload } from '../services/pod.service.js';
import { storage } from '../storage/index.js';
import { notFound } from '../utils/httpError.js';
import { parse } from '../utils/validation.js';

/** Routes shared by both portals (admins, or ACTIVE vendors). */
const router = Router();

const activeUser = (req: Request, res: Response, next: NextFunction) =>
  req.auth?.role === 'ADMIN' ? next() : requireActiveVendor(req, res, next);

router.use(authenticate, activeUser);

const idParam = z.object({ id: z.uuid('Invalid id') });

// ---- Documents: streamed through the API after an RLS-checked lookup ----
router.get('/documents/:id/file', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const doc = await withUser(req.auth!.authUserId, (db) => getDocumentForDownload(db, id));
  let stream;
  try {
    stream = await storage.get(doc.storage_path);
  } catch {
    throw notFound('The document file could not be found in storage.');
  }
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', doc.file_type);
  res.setHeader('Content-Disposition', `${disposition}; filename="${doc.file_name.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

// ---- Notifications ----
router.get('/notifications', async (req, res) => {
  res.json(await withUser(req.auth!.authUserId, (db) => listNotifications(db)));
});

router.post('/notifications/read-all', async (req, res) => {
  await withUser(req.auth!.authUserId, (db) => db.query('update public.notifications set is_read = true where not is_read'));
  res.status(204).end();
});

router.post('/notifications/:id/read', async (req, res) => {
  const { id } = parse(idParam, req.params);
  await withUser(req.auth!.authUserId, (db) => db.query('update public.notifications set is_read = true where id = $1', [id]));
  res.status(204).end();
});

export default router;
