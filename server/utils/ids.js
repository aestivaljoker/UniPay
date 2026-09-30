/**
 * Monotonic, human-readable ID generation.
 *
 * Counters live in counters.json so TXN numbers keep climbing across restarts
 * and look like a real ledger during the demo (TXN-00142, not a random uuid).
 */

import crypto from 'node:crypto';
import { COLLECTIONS, updateData } from './jsonDb.js';

const DEFAULTS = { transaction: 0, walletTransaction: 0, settlement: 0, paymentEvent: 0 };

async function nextValue(name) {
  return updateData(
    COLLECTIONS.counters,
    (counters) => {
      const current = Number.isFinite(counters[name]) ? counters[name] : DEFAULTS[name] ?? 0;
      counters[name] = current + 1;
      return counters[name];
    },
    { ...DEFAULTS }
  );
}

const pad = (n, width) => String(n).padStart(width, '0');

export async function nextTransactionId() {
  return `TXN-${pad(await nextValue('transaction'), 5)}`;
}

export async function nextWalletTransactionId() {
  return `WTX-${pad(await nextValue('walletTransaction'), 5)}`;
}

export async function nextSettlementId() {
  return `STL-${pad(await nextValue('settlement'), 5)}`;
}

export async function nextPaymentEventId() {
  return `EVT-${pad(await nextValue('paymentEvent'), 6)}`;
}

/**
 * Fake payment-gateway reference, e.g. UPI-SIM-829173.
 * The SIM segment is deliberate: it must be obvious in every screenshot and log
 * line that no real rail was touched.
 */
export function simulatedPaymentId(method = 'UPI') {
  const prefix = String(method).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'UPI';
  const digits = 100000 + crypto.randomInt(0, 900000);
  return `${prefix}-SIM-${digits}`;
}

export function simulatedPayoutId() {
  return `PAYOUT-SIM-${100000 + crypto.randomInt(0, 900000)}`;
}

/** Idempotency key fallback when a client does not send one. */
export function randomToken(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Session token for our simple bearer-token auth. */
export function sessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}
