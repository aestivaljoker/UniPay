import express from 'express';
import { login, merchantSignup, studentSignup, currentProfile } from '../services/authService.js';
import { destroySession, requireRole } from '../services/sessionService.js';
import {
  cleanAccountId,
  cleanEmail,
  cleanString,
  requirePassword,
  requireString,
} from '../utils/validate.js';

const router = express.Router();

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post(
  '/student/signup',
  asyncRoute(async (req, res) => {
    const result = await studentSignup({
      name: requireString(req.body.name, 'Name', { max: 80 }),
      email: cleanEmail(req.body.email),
      studentId: cleanAccountId(req.body.studentId, 'Student ID'),
      password: requirePassword(req.body.password),
      course: cleanString(req.body.course, { max: 60 }),
      year: Number.isFinite(Number(req.body.year)) ? Number(req.body.year) : null,
    });
    res.status(201).json({ ok: true, ...result });
  })
);

router.post(
  '/student/login',
  asyncRoute(async (req, res) => {
    const result = await login({
      role: 'STUDENT',
      email: cleanEmail(req.body.email),
      password: String(req.body.password ?? ''),
    });
    res.json({ ok: true, ...result });
  })
);

router.post(
  '/merchant/signup',
  asyncRoute(async (req, res) => {
    const result = await merchantSignup({
      ownerName: requireString(req.body.ownerName, 'Owner name', { max: 80 }),
      shopName: requireString(req.body.shopName, 'Shop name', { max: 80 }),
      email: cleanEmail(req.body.email),
      merchantId: cleanAccountId(req.body.merchantId, 'Merchant ID'),
      password: requirePassword(req.body.password),
      category: cleanString(req.body.category, { max: 60 }) || 'General Store',
      location: cleanString(req.body.location, { max: 120 }),
    });
    res.status(201).json({ ok: true, ...result });
  })
);

router.post(
  '/merchant/login',
  asyncRoute(async (req, res) => {
    const result = await login({
      role: 'MERCHANT',
      email: cleanEmail(req.body.email),
      password: String(req.body.password ?? ''),
    });
    res.json({ ok: true, ...result });
  })
);

router.post(
  '/admin/login',
  asyncRoute(async (req, res) => {
    const result = await login({
      role: 'ADMIN',
      email: cleanEmail(req.body.email),
      password: String(req.body.password ?? ''),
    });
    res.json({ ok: true, ...result });
  })
);

/** Token validation on app boot — lets a refreshed phone stay logged in. */
router.get(
  '/me',
  requireRole('STUDENT', 'MERCHANT', 'ADMIN'),
  asyncRoute(async (req, res) => {
    const profile = await currentProfile(req.auth);
    if (!profile) {
      destroySession(req.auth.token);
      return res.status(401).json({ ok: false, message: 'Account no longer exists.', code: 'ACCOUNT_GONE' });
    }
    res.json({ ok: true, role: req.auth.role, profile });
  })
);

router.post('/logout', requireRole('STUDENT', 'MERCHANT', 'ADMIN'), (req, res) => {
  destroySession(req.auth.token);
  res.json({ ok: true });
});

export default router;
