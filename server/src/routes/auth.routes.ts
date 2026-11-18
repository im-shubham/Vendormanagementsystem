import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authProvider } from '../auth/index.js';
import { authenticate } from '../middleware/auth.js';
import * as auth from '../services/auth.service.js';
import { publicUser } from '../services/profile.service.js';
import { parse, schemas } from '../utils/validation.js';

const router = Router();

// Brute-force protection for credential endpoints
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' } },
});

router.post('/login', credentialLimiter, async (req, res) => {
  const { identifier, password, portal } = parse(schemas.login, req.body);
  res.json(await auth.login(identifier, password, portal));
});

router.post('/activate', credentialLimiter, async (req, res) => {
  const { email, vendorCode, password } = parse(schemas.activate, req.body);
  res.status(201).json(await auth.activateVendor(email, vendorCode, password));
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = parse(schemas.refresh, req.body);
  res.json(await auth.refresh(refreshToken));
});

router.post('/forgot-password', credentialLimiter, async (req, res) => {
  const { email } = parse(schemas.forgot, req.body);
  res.json(await auth.forgotPassword(email));
});

router.post('/reset-password', credentialLimiter, async (req, res) => {
  const { token, password } = parse(schemas.reset, req.body);
  res.json(await auth.resetPassword(token, password));
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.auth!) });
});

router.post('/logout', authenticate, async (req, res) => {
  await authProvider.signOut(req.accessToken!);
  res.status(204).end();
});

export default router;
