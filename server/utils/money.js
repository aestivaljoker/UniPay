/**
 * Money helpers.
 *
 * Balances are stored in RUPEES as numbers, but every arithmetic step is routed
 * through paise integers before being converted back. Adding 0.1 + 0.2 in
 * floating point gives 0.30000000000000004; for a ledger that eventually gets
 * summed across hundreds of rows, that drift is visible. Rounding through
 * integers keeps every stored balance exact to the paisa.
 */

export const MIN_TOPUP = 10;
export const MAX_TOPUP = 50000;
export const MAX_CHARGE = 25000;

export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const toRupees = (paise) => Math.round(paise) / 100;

/** Sum a list of rupee amounts without float drift. */
export const sumRupees = (amounts) => toRupees(amounts.reduce((acc, a) => acc + toPaise(a || 0), 0));

export const addRupees = (a, b) => toRupees(toPaise(a) + toPaise(b));
export const subtractRupees = (a, b) => toRupees(toPaise(a) - toPaise(b));

/**
 * Parse and validate a client-supplied amount.
 * Returns `{ ok: true, amount }` or `{ ok: false, message }`.
 * Rejects NaN, Infinity, zero, negatives, and sub-paisa precision.
 */
export function parseAmount(raw, { min = 1, max = MAX_CHARGE, label = 'amount' } = {}) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, message: 'Enter a valid amount.' };
  }
  const amount = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s₹]/g, ''));

  if (!Number.isFinite(amount)) return { ok: false, message: 'Enter a valid amount.' };
  if (amount <= 0) return { ok: false, message: 'Enter a valid amount.' };
  if (toPaise(amount) !== Number((amount * 100).toFixed(4))) {
    return { ok: false, message: 'Amount cannot be smaller than one paisa.' };
  }
  if (amount < min) return { ok: false, message: `Minimum ${label} is ₹${min}.` };
  if (amount > max) return { ok: false, message: `Maximum ${label} is ₹${max.toLocaleString('en-IN')}.` };

  return { ok: true, amount: toRupees(toPaise(amount)) };
}

/** ₹1,23,456.00 — Indian digit grouping, used in server-side event messages. */
export function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
