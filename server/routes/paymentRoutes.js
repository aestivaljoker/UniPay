/**
 * Payment endpoints.
 *
 * Everything here is SIMULATED — no external gateway is contacted. The
 * "gateway" is a client-side animation; this module is where the simulated
 * result is turned into a real (JSON-backed) ledger entry.
 */

import express from 'express';
import { COLLECTIONS, readData } from '../utils/jsonDb.js';
import {
  chargeStudent,
  creditWallet,
  syncOfflineTransactions,
} from '../services/ledgerService.js';
import { assertOwnAccount, requireRole } from '../services/sessionService.js';
import { MAX_CHARGE, MAX_TOPUP, MIN_TOPUP, parseAmount } from '../utils/money.js';
import { parseStudentQr } from '../utils/qr.js';
import { badRequest, cleanAccountId, cleanString, notFound } from '../utils/validate.js';

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_METHODS = new Set(['UPI', 'CARD', 'NETBANKING']);

/**
 * Wallet PIN configuration.
 *
 * The student PIN is primarily a UI authorisation step on the merchant device.
 * Setting REQUIRE_WALLET_PIN=true also enforces it on this endpoint, which
 * closes the "merchant types an admission number by hand and charges anyone"
 * hole at the API level too.
 */
const DEMO_WALLET_PIN = process.env.DEMO_WALLET_PIN || '2005';
const REQUIRE_WALLET_PIN = String(process.env.REQUIRE_WALLET_PIN ?? '').toLowerCase() === 'true';

/**
 * POST /api/payments/topup
 * Body: { amount, method, idempotencyKey }
 */
router.post(
  '/topup',
  requireRole('STUDENT'),
  asyncRoute(async (req, res) => {
    const studentId = req.auth.accountId;

    const parsed = parseAmount(req.body.amount, { min: MIN_TOPUP, max: MAX_TOPUP, label: 'top-up' });
    if (!parsed.ok) throw badRequest(parsed.message, 'INVALID_AMOUNT');

    const method = String(req.body.method ?? 'UPI').toUpperCase();
    if (!VALID_METHODS.has(method)) throw badRequest('Choose a payment method.', 'INVALID_METHOD');

    const result = await creditWallet({
      studentId,
      amount: parsed.amount,
      method,
      idempotencyKey: cleanString(req.body.idempotencyKey, { max: 80 }) || null,
    });

    res.status(201).json({ ok: true, simulated: true, ...result });
  })
);

/**
 * POST /api/payments/resolve-qr
 * Merchant scans a QR; we validate the payload and return the live wallet.
 */
router.post(
  '/resolve-qr',
  requireRole('MERCHANT'),
  asyncRoute(async (req, res) => {
    const parsed = parseStudentQr(req.body.qr);
    if (!parsed.ok) throw badRequest(parsed.message, 'INVALID_QR');

    const students = await readData(COLLECTIONS.students, []);
    const student = students.find((s) => s.id === parsed.studentId);
    if (!student) throw notFound('Student wallet not found.', 'STUDENT_NOT_FOUND');
    if (student.status === 'BLOCKED') throw badRequest('This wallet is blocked.', 'WALLET_BLOCKED');

    res.json({
      ok: true,
      student: {
        id: student.id,
        name: student.name,
        walletBalance: student.walletBalance,
        course: student.course,
        year: student.year,
        status: student.status,
      },
    });
  })
);

/**
 * POST /api/payments/charge
 * Body: { studentId, amount, note, idempotencyKey }
 * The merchant is taken from the session, never from the body — a merchant can
 * only ever charge into their own receivable.
 */
router.post(
  '/charge',
  requireRole('MERCHANT'),
  asyncRoute(async (req, res) => {
    const merchantId = req.auth.accountId;
    const studentId = cleanAccountId(req.body.studentId, 'Student ID');

    const parsed = parseAmount(req.body.amount, { min: 1, max: MAX_CHARGE, label: 'amount' });
    if (!parsed.ok) throw badRequest(parsed.message, 'INVALID_AMOUNT');

    // Optional server-side PIN enforcement.
    //
    // By default the PIN is a UI-only step (see client PinPad.jsx), which is
    // enough to demonstrate the authorisation flow. Set REQUIRE_WALLET_PIN=true
    // to also enforce it here, so a crafted API call cannot skip the student's
    // approval. Even then this is prototype-grade: the PIN is a single shared
    // demo value, not a per-student secret, and a real system would store a
    // bcrypt hash per wallet and rate-limit attempts.
    if (REQUIRE_WALLET_PIN) {
      const pin = cleanString(req.body.pin, { max: 12 });
      if (!pin) throw badRequest('Student PIN is required to authorise this payment.', 'PIN_REQUIRED');
      if (pin !== DEMO_WALLET_PIN) throw badRequest('Incorrect wallet PIN.', 'PIN_INCORRECT');
    }

    const result = await chargeStudent({
      studentId,
      merchantId,
      amount: parsed.amount,
      note: cleanString(req.body.note, { max: 100 }),
      idempotencyKey: cleanString(req.body.idempotencyKey, { max: 80 }) || null,
      source: 'ONLINE',
    });

    res.status(201).json({ ok: true, ...result });
  })
);

/**
 * POST /api/sync
 * Replay transactions captured while the merchant app was in OFFLINE DEMO mode.
 *
 * PROTOTYPE NOTE: a real offline wallet cannot trust the terminal's queue —
 * a device with no server contact cannot know the balance is still there, so
 * genuine offline stored value needs signed, hardware-backed credentials.
 * Here the server re-checks every balance at sync time, which means an offline
 * transaction CAN legitimately fail. That is realistic, and the UI shows it.
 */
router.post(
  '/sync',
  requireRole('MERCHANT'),
  asyncRoute(async (req, res) => {
    const merchantId = req.auth.accountId;
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

    if (!rawItems.length) throw badRequest('Nothing queued to synchronise.', 'EMPTY_QUEUE');
    if (rawItems.length > 50) throw badRequest('Too many queued transactions in one sync.', 'QUEUE_TOO_LARGE');

    const items = rawItems.map((item, index) => {
      const parsed = parseAmount(item.amount, { min: 1, max: MAX_CHARGE, label: 'amount' });
      if (!parsed.ok) throw badRequest(`Queued item ${index + 1}: ${parsed.message}`, 'INVALID_AMOUNT');

      const clientKey = cleanString(item.clientKey, { max: 80 });
      if (!clientKey) throw badRequest(`Queued item ${index + 1} is missing its sync key.`, 'MISSING_CLIENT_KEY');

      return {
        studentId: cleanAccountId(item.studentId, 'Student ID'),
        amount: parsed.amount,
        note: cleanString(item.note, { max: 100 }),
        clientKey: `offline:${merchantId}:${clientKey}`,
        occurredAt: isoOrNull(item.occurredAt),
      };
    });

    const result = await syncOfflineTransactions({ merchantId, items });
    res.json({ ok: true, ...result });
  })
);

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Never accept a future timestamp from a client clock that is wrong.
  return date.getTime() > Date.now() ? new Date().toISOString() : date.toISOString();
}

export default router;
