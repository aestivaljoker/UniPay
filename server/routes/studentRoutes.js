import express from 'express';
import { COLLECTIONS, readData } from '../utils/jsonDb.js';
import { studentSummary, transactionsOverview } from '../services/analyticsService.js';
import { publicStudent } from '../services/ledgerService.js';
import { assertOwnAccount, requireRole } from '../services/sessionService.js';
import { buildStudentQrPayload } from '../utils/qr.js';
import { cleanAccountId, notFound } from '../utils/validate.js';

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get(
  '/:id',
  requireRole('STUDENT', 'ADMIN'),
  asyncRoute(async (req, res) => {
    const id = cleanAccountId(req.params.id, 'Student ID');
    assertOwnAccount(req, id);

    const summary = await studentSummary(id);
    if (!summary) throw notFound('Student wallet not found.', 'STUDENT_NOT_FOUND');
    res.json({ ok: true, ...summary });
  })
);

/** The QR payload is generated server-side so the contract lives in one place. */
router.get(
  '/:id/qr',
  requireRole('STUDENT', 'ADMIN'),
  asyncRoute(async (req, res) => {
    const id = cleanAccountId(req.params.id, 'Student ID');
    assertOwnAccount(req, id);

    const students = await readData(COLLECTIONS.students, []);
    const student = students.find((s) => s.id === id);
    if (!student) throw notFound('Student wallet not found.', 'STUDENT_NOT_FOUND');

    res.json({
      ok: true,
      studentId: student.id,
      name: student.name,
      // Balance is deliberately NOT part of `payload`; it is returned alongside
      // only so the student's own screen can show it.
      payload: buildStudentQrPayload(student.id),
      compact: student.qrIdentifier,
      balance: student.walletBalance,
    });
  })
);

router.get(
  '/:id/transactions',
  requireRole('STUDENT', 'ADMIN'),
  asyncRoute(async (req, res) => {
    const id = cleanAccountId(req.params.id, 'Student ID');
    assertOwnAccount(req, id);
    const summary = await studentSummary(id);
    if (!summary) throw notFound('Student wallet not found.', 'STUDENT_NOT_FOUND');
    res.json({ ok: true, ledger: summary.ledger, charges: await transactionsOverview({ studentId: id, limit: 50 }) });
  })
);

/**
 * Merchant-facing lookup: resolve a scanned QR to a student.
 * This is the endpoint that makes "no balance in the QR" workable — the merchant
 * app learns the balance from the server, at scan time.
 */
router.get(
  '/:id/wallet',
  requireRole('MERCHANT', 'ADMIN'),
  asyncRoute(async (req, res) => {
    const id = cleanAccountId(req.params.id, 'Student ID');
    const students = await readData(COLLECTIONS.students, []);
    const student = students.find((s) => s.id === id);
    if (!student) throw notFound('Student wallet not found.', 'STUDENT_NOT_FOUND');

    const { id: studentId, name, walletBalance, status, course, year } = publicStudent(student);
    res.json({ ok: true, student: { id: studentId, name, walletBalance, status, course, year } });
  })
);

export default router;
