import { Router } from 'express';
import { z } from 'zod';
import { withUser } from '../db/pool.js';
import { authenticate, requireActiveVendor } from '../middleware/auth.js';
import { podUpload } from '../middleware/upload.js';
import * as pods from '../services/pod.service.js';
import { listQuery, parse, schemas } from '../utils/validation.js';

/** Vendor portal API. Every route requires an authenticated, ACTIVE vendor. */
const router = Router();
router.use(authenticate, requireActiveVendor);

const idParam = z.object({ id: z.uuid('Invalid id') });
const filesOf = (req: Express.Request) => {
  const f = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  return { podDocument: f.podDocument?.[0], supportingPhoto: f.supportingPhoto?.[0] };
};

router.get('/dashboard', async (req, res) => {
  res.json(await withUser(req.auth!.authUserId, (db) => pods.vendorDashboard(db)));
});

router.get('/submissions', async (req, res) => {
  const q = parse(listQuery, req.query);
  // vendorId filter is forced to the caller (RLS enforces it as well)
  res.json(await withUser(req.auth!.authUserId, (db) => pods.listSubmissions(db, { ...q, vendorId: req.auth!.vendorId!, search: undefined })));
});

router.get('/submissions/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json(await withUser(req.auth!.authUserId, (db) => pods.getSubmission(db, id)));
});

router.post('/submissions', podUpload, async (req, res) => {
  const input = parse(schemas.podSubmission, req.body);
  const submission = await pods.createSubmission(req.auth!, input, filesOf(req));
  res.status(201).json({ submission, message: `POD submitted successfully. Submission ID: ${submission.submissionNumber}` });
});

router.post('/submissions/:id/reupload', podUpload, async (req, res) => {
  const { id } = parse(idParam, req.params);
  const input = parse(schemas.reupload, req.body);
  const submission = await pods.reuploadSubmission(req.auth!, id, input, filesOf(req));
  res.json({ submission, message: `Corrected POD uploaded (version ${submission.currentVersion}). It is now under review.` });
});

export default router;
