/**
 * The ledger — every rupee that moves in UniPay moves through here.
 *
 * Invariants this module is responsible for:
 *   1. No balance changes without a corresponding ledger row.
 *   2. A student's balance never goes negative.
 *   3. merchant.pendingReceivable === sum(amount of that merchant's
 *      SUCCESS transactions with settlementStatus === 'PENDING').
 *   4. The same idempotency key never applies twice.
 *   5. All arithmetic is server-side; a client-reported balance is never trusted.
 *
 * Multi-collection writes go through `updateMany`, which takes one combined lock
 * across the files it touches. That is what makes a charge atomic: the student
 * debit, the merchant receivable credit and the transaction row either all land
 * or none do.
 */

import { COLLECTIONS, readData, updateMany } from '../utils/jsonDb.js';
import {
  nextSettlementId,
  nextTransactionId,
  nextWalletTransactionId,
  simulatedPayoutId,
  simulatedPaymentId,
} from '../utils/ids.js';
import { addRupees, formatINR, subtractRupees, sumRupees } from '../utils/money.js';
import { badRequest, conflict, notFound } from '../utils/validate.js';
import { recordEvent } from './eventService.js';
import { emitEvent } from '../socket/realtime.js';

/**
 * Idempotency ledger: key -> finished result.
 * In memory because a restart already clears sessions; a replayed request after
 * a restart is indistinguishable from a fresh one in a prototype.
 */
const idempotencyResults = new Map();
const idempotencyInFlight = new Map();
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;

function rememberResult(key, result) {
  if (!key) return;
  idempotencyResults.set(key, { result, at: Date.now() });
  // Opportunistic cleanup so the map cannot grow unbounded over a long demo day.
  if (idempotencyResults.size > 500) {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    for (const [k, v] of idempotencyResults) if (v.at < cutoff) idempotencyResults.delete(k);
  }
}

/**
 * Wrap an operation so a repeated key returns the original result instead of
 * charging twice. Concurrent duplicates await the in-flight promise; a
 * *completed* key is reported as a duplicate so the UI can say so explicitly.
 */
async function withIdempotency(key, operation) {
  if (!key) return operation();

  const cached = idempotencyResults.get(key);
  if (cached) throw conflict('Transaction already processed.', 'DUPLICATE_TRANSACTION');

  const inFlight = idempotencyInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const result = await operation();
    rememberResult(key, result);
    return result;
  })();

  idempotencyInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    idempotencyInFlight.delete(key);
  }
}

const findById = (rows, id) =>
  rows.find((r) => String(r.id).toUpperCase() === String(id).toUpperCase());

// ---------------------------------------------------------------------------
// Wallet top-up (simulated gateway)
// ---------------------------------------------------------------------------

/**
 * Credit a student's wallet after the simulated gateway "succeeds".
 * The gateway is entirely client-side theatre; the money only becomes real
 * (in our JSON sense) here, on the server.
 */
export async function creditWallet({ studentId, amount, method = 'UPI', idempotencyKey }) {
  return withIdempotency(idempotencyKey, async () => {
    const paymentId = simulatedPaymentId(method);
    const walletTxnId = await nextWalletTransactionId();

    const outcome = await updateMany([COLLECTIONS.students, COLLECTIONS.walletTransactions], (db) => {
      const student = findById(db.students, studentId);
      if (!student) throw notFound('Student wallet not found.', 'STUDENT_NOT_FOUND');
      if (student.status === 'BLOCKED') throw badRequest('This wallet is blocked.', 'WALLET_BLOCKED');

      const balanceBefore = student.walletBalance;
      student.walletBalance = addRupees(balanceBefore, amount);

      const row = {
        id: walletTxnId,
        studentId: student.id,
        studentName: student.name,
        type: 'TOPUP',
        amount,
        balanceBefore,
        balanceAfter: student.walletBalance,
        status: 'SUCCESS',
        method: String(method).toUpperCase(),
        simulated: true,
        paymentId,
        gateway: 'UNIPAY_SIMULATED_GATEWAY',
        createdAt: new Date().toISOString(),
      };
      db.walletTransactions.push(row);

      return { student: { ...student }, walletTransaction: row, balanceBefore };
    });

    const event = await recordEvent({
      type: 'payment:topup',
      title: 'PAYMENT RECEIVED',
      studentId: outcome.student.id,
      studentName: outcome.student.name,
      amount,
      method: String(method).toUpperCase(),
      paymentId,
      status: 'SUCCESS',
      balanceBefore: outcome.balanceBefore,
      balanceAfter: outcome.student.walletBalance,
      message: `${outcome.student.name} topped up ${formatINR(amount)}`,
    });

    const payload = {
      event,
      walletTransaction: outcome.walletTransaction,
      student: publicStudent(outcome.student),
    };

    emitEvent('payment:topup', payload, { studentId: outcome.student.id });
    emitEvent(
      'wallet:updated',
      {
        studentId: outcome.student.id,
        studentName: outcome.student.name,
        balance: outcome.student.walletBalance,
        balanceBefore: outcome.balanceBefore,
        delta: amount,
        reason: 'TOPUP',
      },
      { studentId: outcome.student.id }
    );
    emitEvent('transaction:new', { kind: 'TOPUP', transaction: outcome.walletTransaction }, { studentId: outcome.student.id });
    emitEvent('stats:dirty', { reason: 'topup' });

    return payload;
  });
}

// ---------------------------------------------------------------------------
// Merchant charge
// ---------------------------------------------------------------------------

/**
 * Debit a student and credit the merchant's RECEIVABLE (not their bank).
 * `occurredAt` lets an offline-queued transaction keep the time it was actually
 * taken at the counter rather than the time it synced.
 */
export async function chargeStudent({
  studentId,
  merchantId,
  amount,
  note = '',
  idempotencyKey,
  source = 'ONLINE',
  occurredAt = null,
}) {
  return withIdempotency(idempotencyKey, async () => {
    const txnId = await nextTransactionId();

    const outcome = await updateMany(
      [COLLECTIONS.students, COLLECTIONS.merchants, COLLECTIONS.transactions],
      (db) => {
        const student = findById(db.students, studentId);
        if (!student) throw notFound('Student wallet not found.', 'STUDENT_NOT_FOUND');
        const merchant = findById(db.merchants, merchantId);
        if (!merchant) throw notFound('Merchant not found.', 'MERCHANT_NOT_FOUND');

        if (student.status === 'BLOCKED') throw badRequest('This wallet is blocked.', 'WALLET_BLOCKED');
        if (merchant.status === 'BLOCKED') throw badRequest('This merchant is suspended.', 'MERCHANT_BLOCKED');

        // The only place a balance is checked, and it is checked against stored
        // state — never against a number the client sent us.
        if (student.walletBalance < amount) {
          throw badRequest('Insufficient wallet balance.', 'INSUFFICIENT_BALANCE');
        }

        const balanceBefore = student.walletBalance;
        student.walletBalance = subtractRupees(balanceBefore, amount);

        const receivableBefore = merchant.pendingReceivable;
        merchant.pendingReceivable = addRupees(receivableBefore, amount);

        const row = {
          id: txnId,
          studentId: student.id,
          studentName: student.name,
          merchantId: merchant.id,
          merchantName: merchant.shopName,
          amount,
          status: 'SUCCESS',
          settlementStatus: 'PENDING',
          settlementId: null,
          note,
          source, // ONLINE | OFFLINE_SYNC
          studentBalanceBefore: balanceBefore,
          studentBalanceAfter: student.walletBalance,
          merchantReceivableAfter: merchant.pendingReceivable,
          createdAt: occurredAt ?? new Date().toISOString(),
          syncedAt: source === 'OFFLINE_SYNC' ? new Date().toISOString() : null,
        };
        db.transactions.push(row);

        return {
          transaction: row,
          student: { ...student },
          merchant: { ...merchant },
          balanceBefore,
          receivableBefore,
        };
      }
    );

    const { transaction, student, merchant } = outcome;

    const event = await recordEvent({
      type: 'payment:studentCharged',
      title: source === 'OFFLINE_SYNC' ? 'OFFLINE PAYMENT SYNCED' : 'PAYMENT',
      transactionId: transaction.id,
      studentId: student.id,
      studentName: student.name,
      merchantId: merchant.id,
      merchantName: merchant.shopName,
      amount,
      status: 'SUCCESS',
      source,
      balanceAfter: student.walletBalance,
      receivableAfter: merchant.pendingReceivable,
      message: `${student.name} paid ${formatINR(amount)} to ${merchant.shopName}${
        source === 'OFFLINE_SYNC' ? ' (offline, now synced)' : ''
      }`,
    });

    const payload = {
      event,
      transaction,
      student: publicStudent(student),
      merchant: publicMerchant(merchant),
    };

    const routing = { studentId: student.id, merchantId: merchant.id };
    emitEvent('payment:studentCharged', payload, routing);
    emitEvent(
      'wallet:updated',
      {
        studentId: student.id,
        studentName: student.name,
        balance: student.walletBalance,
        balanceBefore: outcome.balanceBefore,
        delta: -amount,
        reason: 'CHARGE',
        merchantName: merchant.shopName,
      },
      routing
    );
    emitEvent(
      'merchant:receivableUpdated',
      {
        merchantId: merchant.id,
        merchantName: merchant.shopName,
        pendingReceivable: merchant.pendingReceivable,
        receivableBefore: outcome.receivableBefore,
        delta: amount,
      },
      routing
    );
    emitEvent('transaction:new', { kind: 'CHARGE', transaction }, routing);
    emitEvent('stats:dirty', { reason: 'charge' });

    return payload;
  });
}

// ---------------------------------------------------------------------------
// Merchant settlement (simulated payout)
// ---------------------------------------------------------------------------

/**
 * Settle everything a merchant is currently owed.
 * The amount is derived from the pending transactions inside the lock, so a
 * charge landing mid-settlement is either fully included or left for the next
 * batch — never half-counted.
 */
export async function settleMerchant({ merchantId, initiatedBy = 'ADMIN001', idempotencyKey }) {
  return withIdempotency(idempotencyKey, async () => {
    const settlementId = await nextSettlementId();
    const reference = simulatedPayoutId();

    const outcome = await updateMany(
      [COLLECTIONS.merchants, COLLECTIONS.transactions, COLLECTIONS.settlements],
      (db) => {
        const merchant = findById(db.merchants, merchantId);
        if (!merchant) throw notFound('Merchant not found.', 'MERCHANT_NOT_FOUND');

        const pending = db.transactions.filter(
          (t) =>
            String(t.merchantId).toUpperCase() === String(merchantId).toUpperCase() &&
            t.status === 'SUCCESS' &&
            t.settlementStatus === 'PENDING'
        );

        if (!pending.length) {
          throw badRequest('Nothing pending to settle for this merchant.', 'NOTHING_TO_SETTLE');
        }

        const amount = sumRupees(pending.map((t) => t.amount));
        const now = new Date().toISOString();

        for (const txn of pending) {
          txn.settlementStatus = 'SETTLED';
          txn.settlementId = settlementId;
          txn.settledAt = now;
        }

        const receivableBefore = merchant.pendingReceivable;
        merchant.pendingReceivable = subtractRupees(receivableBefore, amount);
        // Defensive: if seed drift ever left the counter above the ledger sum,
        // clamp rather than carry a negative receivable into the dashboard.
        if (merchant.pendingReceivable < 0) merchant.pendingReceivable = 0;
        merchant.lifetimeSettled = addRupees(merchant.lifetimeSettled ?? 0, amount);

        const settlement = {
          id: settlementId,
          merchantId: merchant.id,
          merchantName: merchant.shopName,
          amount,
          transactionCount: pending.length,
          transactionIds: pending.map((t) => t.id),
          status: 'COMPLETED',
          method: 'SIMULATED_BANK_TRANSFER',
          simulated: true,
          reference,
          initiatedBy,
          createdAt: now,
          completedAt: now,
        };
        db.settlements.push(settlement);

        return { settlement, merchant: { ...merchant }, receivableBefore };
      }
    );

    const { settlement, merchant } = outcome;

    const event = await recordEvent({
      type: 'merchant:payout',
      title: 'MERCHANT PAYOUT',
      merchantId: merchant.id,
      merchantName: merchant.shopName,
      amount: settlement.amount,
      settlementId: settlement.id,
      reference: settlement.reference,
      transactionCount: settlement.transactionCount,
      status: 'SUCCESS',
      message: `${merchant.shopName} payout of ${formatINR(settlement.amount)} completed`,
    });

    const payload = { event, settlement, merchant: publicMerchant(merchant) };

    emitEvent('merchant:payout', payload, { merchantId: merchant.id });
    emitEvent(
      'merchant:receivableUpdated',
      {
        merchantId: merchant.id,
        merchantName: merchant.shopName,
        pendingReceivable: merchant.pendingReceivable,
        receivableBefore: outcome.receivableBefore,
        delta: -settlement.amount,
        reason: 'SETTLEMENT',
      },
      { merchantId: merchant.id }
    );
    emitEvent('stats:dirty', { reason: 'payout' });

    return payload;
  });
}

// ---------------------------------------------------------------------------
// Offline sync
// ---------------------------------------------------------------------------

/**
 * Replay a batch of transactions a merchant took while "offline".
 *
 * Each queued item carries a client-generated key; that key is what makes the
 * replay safe to retry. Items are processed one at a time and reported
 * individually, because a single insufficient-balance failure must not discard
 * the rest of the batch.
 */
export async function syncOfflineTransactions({ merchantId, items }) {
  const results = [];

  for (const item of items) {
    try {
      const result = await chargeStudent({
        studentId: item.studentId,
        merchantId,
        amount: item.amount,
        note: item.note ?? '',
        idempotencyKey: item.clientKey,
        source: 'OFFLINE_SYNC',
        occurredAt: item.occurredAt ?? null,
      });
      results.push({
        clientKey: item.clientKey,
        status: 'SYNCED',
        transaction: result.transaction,
        student: result.student,
      });
    } catch (err) {
      // A duplicate key means this item already landed on a previous attempt —
      // that is a success from the merchant's point of view, not a failure.
      const duplicate = err.code === 'DUPLICATE_TRANSACTION';
      results.push({
        clientKey: item.clientKey,
        status: duplicate ? 'ALREADY_SYNCED' : 'FAILED',
        message: duplicate ? 'Transaction already processed.' : err.expose ? err.message : 'Sync failed.',
        code: err.code ?? 'SYNC_FAILED',
      });
    }
  }

  const synced = results.filter((r) => r.status === 'SYNCED');
  const failed = results.filter((r) => r.status === 'FAILED');

  const merchants = await readData(COLLECTIONS.merchants, []);
  const merchant = findById(merchants, merchantId);

  const event = await recordEvent({
    type: 'sync:completed',
    title: 'OFFLINE SYNC',
    merchantId: merchant?.id ?? merchantId,
    merchantName: merchant?.shopName ?? merchantId,
    amount: sumRupees(synced.map((r) => r.transaction.amount)),
    status: failed.length ? 'PARTIAL' : 'SUCCESS',
    syncedCount: synced.length,
    failedCount: failed.length,
    message: `${merchant?.shopName ?? merchantId} synced ${synced.length} offline transaction${
      synced.length === 1 ? '' : 's'
    }${failed.length ? `, ${failed.length} failed` : ''}`,
  });

  const payload = {
    event,
    results,
    syncedCount: synced.length,
    failedCount: failed.length,
    merchant: merchant ? publicMerchant(merchant) : null,
  };

  emitEvent('sync:completed', payload, { merchantId });
  emitEvent('stats:dirty', { reason: 'sync' });

  return payload;
}

// ---------------------------------------------------------------------------
// Serialisers — never leak passwordHash to a client
// ---------------------------------------------------------------------------

export function publicStudent(student) {
  if (!student) return null;
  const { passwordHash, ...rest } = student;
  return rest;
}

export function publicMerchant(merchant) {
  if (!merchant) return null;
  const { passwordHash, ...rest } = merchant;
  return rest;
}

/** Exposed for tests: clears the idempotency memory between cases. */
export function __clearIdempotency() {
  idempotencyResults.clear();
  idempotencyInFlight.clear();
}
