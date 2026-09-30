import express from 'express';
import { merchantSummary, transactionsOverview } from '../services/analyticsService.js';
import { assertOwnAccount, requireRole } from '../services/sessionService.js';
import { cleanAccountId, notFound } from '../utils/validate.js';

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get(
  '/:id',
  requireRole('MERCHANT', 'ADMIN'),
  asyncRoute(async (req, res) => {
    const id = cleanAccountId(req.params.id, 'Merchant ID');
    assertOwnAccount(req, id);
    const summary = await merchantSummary(id);
    if (!summary) throw notFound('Merchant not found.', 'MERCHANT_NOT_FOUND');
    res.json({ ok: true, ...summary });
  })
);

router.get(
  '/:id/transactions',
  requireRole('MERCHANT', 'ADMIN'),
  asyncRoute(async (req, res) => {
    const id = cleanAccountId(req.params.id, 'Merchant ID');
    assertOwnAccount(req, id);
    const transactions = await transactionsOverview({ merchantId: id, limit: 100 });
    res.json({ ok: true, transactions });
  })
);

router.get(
  '/:id/settlements',
  requireRole('MERCHANT', 'ADMIN'),
  asyncRoute(async (req, res) => {
    const id = cleanAccountId(req.params.id, 'Merchant ID');
    assertOwnAccount(req, id);
    const summary = await merchantSummary(id);
    if (!summary) throw notFound('Merchant not found.', 'MERCHANT_NOT_FOUND');
    res.json({ ok: true, settlements: summary.settlements });
  })
);

export default router;
