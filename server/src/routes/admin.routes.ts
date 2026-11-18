import { Router } from 'express';
import { z } from 'zod';
import { withUser } from '../db/pool.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import * as pods from '../services/pod.service.js';
import * as vendors from '../services/vendorMaster.service.js';
import { listQuery, parse, schemas } from '../utils/validation.js';

/** Admin portal API. Every route requires an ADMIN profile (and RLS checks is_admin()). */
const router = Router();
router.use(authenticate, requireAdmin);

const idParam = z.object({ id: z.uuid('Invalid id') });
const asAdmin = <T>(req: Express.Request, fn: Parameters<typeof withUser<T>>[1]) => withUser<T>(req.auth!.authUserId, fn);

router.get('/dashboard', async (req, res) => {
  res.json(await asAdmin(req, (db) => pods.adminDashboard(db)));
});

// ---- Vendor master (CRUD; delete = deactivate) ----------------------
router.get('/vendors', async (req, res) => {
  const q = parse(listQuery, req.query);
  res.json(await asAdmin(req, (db) => vendors.listVendors(db, q)));
});

router.post('/vendors', async (req, res) => {
  const input = parse(schemas.vendor, req.body);
  res.status(201).json({ vendor: await asAdmin(req, (db) => vendors.createVendor(db, input)) });
});

router.get('/vendors/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json(await asAdmin(req, (db) => vendors.getVendor(db, id)));
});

router.put('/vendors/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const input = parse(schemas.vendor, req.body);
  res.json({ vendor: await asAdmin(req, (db) => vendors.updateVendor(db, id, input)) });
});

router.post('/vendors/:id/deactivate', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ vendor: await asAdmin(req, (db) => vendors.deactivateVendor(db, id)) });
});

router.post('/vendors/:id/reactivate', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ vendor: await asAdmin(req, (db) => vendors.reactivateVendor(db, id)) });
});

// ---- Registration requests ------------------------------------------
router.get('/registrations', async (req, res) => {
  const q = parse(listQuery, req.query);
  res.json(await asAdmin(req, (db) => vendors.listRegistrations(db, q)));
});

router.post('/registrations/:id/approve', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { remarks } = parse(schemas.regReject, req.body ?? {});
  res.json({ vendor: await asAdmin(req, (db) => vendors.reviewRegistration(db, id, 'APPROVED', remarks)) });
});

router.post('/registrations/:id/reject', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { remarks } = parse(schemas.regReject, req.body ?? {});
  res.json({ vendor: await asAdmin(req, (db) => vendors.reviewRegistration(db, id, 'REJECTED', remarks)) });
});

// ---- POD submissions -------------------------------------------------
router.get('/submissions', async (req, res) => {
  const q = parse(listQuery, req.query);
  res.json(await asAdmin(req, (db) => pods.listSubmissions(db, q)));
});

router.get('/submissions/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json(await asAdmin(req, (db) => pods.getSubmission(db, id)));
});

router.post('/submissions/:id/approve', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { remarks } = parse(schemas.review, req.body ?? {});
  res.json({ submission: await asAdmin(req, (db) => pods.reviewSubmission(db, id, 'APPROVED', remarks)) });
});

router.post('/submissions/:id/reject', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { remarks } = parse(schemas.reject, req.body ?? {});
  res.json({ submission: await asAdmin(req, (db) => pods.reviewSubmission(db, id, 'REJECTED', remarks)) });
});

export default router;
