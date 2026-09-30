import express from 'express';
import {
  dashboardSnapshot,
  merchantsOverview,
  payoutsOverview,
  studentsOverview,
  transactionsOverview,
} from '../services/analyticsService.js';
import { listEvents } from '../services/eventService.js';
import { settleMerchant } from '../services/ledgerService.js';
import { requireRole } from '../services/sessionService.js';
import { resetDemoData } from '../services/seedService.js';
import { broadcast } from '../socket/realtime.js';
import { cleanAccountId, cleanString } from '../utils/validate.js';

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requireRole('ADMIN'));

router.get(
  '/dashboard',
  asyncRoute(async (_req, res) => {
    res.json({ ok: true, ...(await dashboardSnapshot()) });
  })
);

router.get(
  '/students',
  asyncRoute(async (_req, res) => {
    res.json({ ok: true, students: await studentsOverview() });
  })
);

router.get(
  '/merchants',
  asyncRoute(async (_req, res) => {
    res.json({ ok: true, merchants: await merchantsOverview() });
  })
);

router.get(
  '/transactions',
  asyncRoute(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json({ ok: true, transactions: await transactionsOverview({ limit }) });
  })
);

router.get(
  '/payouts',
  asyncRoute(async (_req, res) => {
    res.json({ ok: true, ...(await payoutsOverview()) });
  })
);

router.get(
  '/activity',
  asyncRoute(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json({ ok: true, activity: await listEvents(limit) });
  })
);

/**
 * POST /api/admin/settlements/:merchantId  (also mounted at /api/settlements/:merchantId)
 * Simulated bank transfer — clears the merchant's whole pending receivable.
 */
router.post(
  '/settlements/:merchantId',
  asyncRoute(async (req, res) => {
    const merchantId = cleanAccountId(req.params.merchantId, 'Merchant ID');
    const result = await settleMerchant({
      merchantId,
      initiatedBy: req.auth.accountId,
      idempotencyKey: cleanString(req.body?.idempotencyKey, { max: 80 }) || null,
    });
    res.status(201).json({ ok: true, simulated: true, ...result });
  })
);

/** Wipe and rebuild the demo dataset. Every connected client is told to reload. */
router.post(
  '/reset',
  asyncRoute(async (req, res) => {
    if (cleanString(req.body?.confirm) !== 'RESET') {
      return res.status(400).json({ ok: false, message: 'Reset not confirmed.', code: 'NOT_CONFIRMED' });
    }
    const summary = await resetDemoData();
    broadcast('demo:reset', { at: new Date().toISOString(), summary });
    res.json({ ok: true, message: 'Demo data reset to its initial state.', summary });
  })
);

export default router;

/** Standalone router so POST /api/settlements/:merchantId works as specified. */
export const settlementRouter = express.Router();
settlementRouter.post(
  '/:merchantId',
  requireRole('ADMIN'),
  asyncRoute(async (req, res) => {
    const merchantId = cleanAccountId(req.params.merchantId, 'Merchant ID');
    const result = await settleMerchant({
      merchantId,
      initiatedBy: req.auth.accountId,
      idempotencyKey: cleanString(req.body?.idempotencyKey, { max: 80 }) || null,
    });
    res.status(201).json({ ok: true, simulated: true, ...result });
  })
);
