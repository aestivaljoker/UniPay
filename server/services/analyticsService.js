/**
 * Every dashboard number is derived from the JSON ledger on read.
 * Nothing is pre-aggregated, so a reset or a hand-edit of the data files can
 * never leave the dashboard disagreeing with the ledger.
 */

import { COLLECTIONS, readData } from '../utils/jsonDb.js';
import { sumRupees } from '../utils/money.js';
import { publicMerchant, publicStudent } from './ledgerService.js';
import { connectionCount } from '../socket/realtime.js';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const isToday = (iso) => new Date(iso).getTime() >= startOfToday();

async function loadAll() {
  const [students, merchants, transactions, walletTransactions, settlements, paymentEvents] = await Promise.all([
    readData(COLLECTIONS.students, []),
    readData(COLLECTIONS.merchants, []),
    readData(COLLECTIONS.transactions, []),
    readData(COLLECTIONS.walletTransactions, []),
    readData(COLLECTIONS.settlements, []),
    readData(COLLECTIONS.paymentEvents, []),
  ]);
  return { students, merchants, transactions, walletTransactions, settlements, paymentEvents };
}

export async function dashboardSnapshot() {
  const db = await loadAll();
  const { students, merchants, transactions, walletTransactions, settlements, paymentEvents } = db;

  const successful = transactions.filter((t) => t.status === 'SUCCESS');
  const todays = successful.filter((t) => isToday(t.createdAt));
  const pending = successful.filter((t) => t.settlementStatus === 'PENDING');

  const totalWalletBalance = sumRupees(students.map((s) => s.walletBalance));
  const pendingPayout = sumRupees(merchants.map((m) => m.pendingReceivable));
  const todaysTopups = walletTransactions.filter((w) => w.status === 'SUCCESS' && isToday(w.createdAt));

  return {
    generatedAt: new Date().toISOString(),
    demoMode: true,
    liveConnections: connectionCount(),
    stats: {
      totalStudents: students.length,
      activeStudents: students.filter((s) => s.status === 'ACTIVE').length,
      totalMerchants: merchants.length,
      totalWalletBalance,
      todaysPaymentVolume: sumRupees(todays.map((t) => t.amount)),
      todaysPaymentCount: todays.length,
      todaysTopupVolume: sumRupees(todaysTopups.map((w) => w.amount)),
      todaysTopupCount: todaysTopups.length,
      pendingPayout,
      pendingPayoutCount: pending.length,
      merchantsAwaitingPayout: merchants.filter((m) => m.pendingReceivable > 0).length,
      completedSettlements: settlements.filter((s) => s.status === 'COMPLETED').length,
      lifetimeSettled: sumRupees(settlements.map((s) => s.amount)),
      lifetimeVolume: sumRupees(successful.map((t) => t.amount)),
      totalTransactions: successful.length,
    },
    charts: {
      volumeByDay: volumeByDay(successful, walletTransactions),
      topMerchants: topMerchants(merchants, successful),
      hourlyToday: hourlyToday(todays),
    },
    payouts: buildPayouts(merchants, pending),
    recentTransactions: [...successful].reverse().slice(0, 15),
    recentSettlements: [...settlements].reverse().slice(0, 10),
    activity: [...paymentEvents].reverse().slice(0, 40),
  };
}

/** Last 7 days of charge volume + top-up volume, oldest first. */
function volumeByDay(transactions, walletTransactions) {
  const days = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = base.getTime() - i * 86400000;
    const dayEnd = dayStart + 86400000;
    const inRange = (iso) => {
      const t = new Date(iso).getTime();
      return t >= dayStart && t < dayEnd;
    };
    const charges = transactions.filter((t) => inRange(t.createdAt));
    const topups = walletTransactions.filter((w) => w.status === 'SUCCESS' && inRange(w.createdAt));

    days.push({
      date: new Date(dayStart).toISOString().slice(0, 10),
      label: new Date(dayStart).toLocaleDateString('en-IN', { weekday: 'short' }),
      payments: sumRupees(charges.map((t) => t.amount)),
      paymentCount: charges.length,
      topups: sumRupees(topups.map((w) => w.amount)),
    });
  }
  return days;
}

function topMerchants(merchants, transactions) {
  return merchants
    .map((m) => {
      const own = transactions.filter((t) => t.merchantId === m.id);
      return {
        merchantId: m.id,
        shopName: m.shopName,
        category: m.category,
        volume: sumRupees(own.map((t) => t.amount)),
        count: own.length,
        pendingReceivable: m.pendingReceivable,
      };
    })
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 6);
}

function hourlyToday(todays) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, amount: 0, count: 0 }));
  for (const t of todays) {
    const hour = new Date(t.createdAt).getHours();
    buckets[hour].amount = sumRupees([buckets[hour].amount, t.amount]);
    buckets[hour].count += 1;
  }
  // Campus hours only — a 24-bar chart that is empty overnight reads as broken.
  return buckets.slice(7, 22);
}

/** The "TO BE PAID" table: one row per merchant with a non-zero receivable. */
function buildPayouts(merchants, pendingTransactions) {
  return merchants
    .map((m) => {
      const own = pendingTransactions.filter((t) => t.merchantId === m.id);
      return {
        merchantId: m.id,
        shopName: m.shopName,
        ownerName: m.ownerName,
        category: m.category,
        location: m.location,
        amount: m.pendingReceivable,
        // Derived from the ledger, so it always matches what a payout would take.
        ledgerAmount: sumRupees(own.map((t) => t.amount)),
        transactionCount: own.length,
        oldestPendingAt: own.length
          ? own.reduce((min, t) => (new Date(t.createdAt) < new Date(min) ? t.createdAt : min), own[0].createdAt)
          : null,
        status: m.pendingReceivable > 0 ? 'PENDING' : 'SETTLED',
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export async function studentsOverview() {
  const db = await loadAll();
  return db.students.map((s) => {
    const charges = db.transactions.filter((t) => t.studentId === s.id && t.status === 'SUCCESS');
    const topups = db.walletTransactions.filter((w) => w.studentId === s.id && w.status === 'SUCCESS');
    const lastCharge = charges.at(-1);
    const lastTopup = topups.at(-1);
    const lastAt = [lastCharge?.createdAt, lastTopup?.createdAt].filter(Boolean).sort().at(-1) ?? null;

    return {
      ...publicStudent(s),
      totalSpent: sumRupees(charges.map((t) => t.amount)),
      totalToppedUp: sumRupees(topups.map((w) => w.amount)),
      transactionCount: charges.length,
      lastTransactionAt: lastAt,
      lastTransactionLabel: lastCharge && lastCharge.createdAt === lastAt ? `Paid ${lastCharge.merchantName}` : lastTopup && lastTopup.createdAt === lastAt ? 'Wallet top-up' : '—',
    };
  });
}

export async function merchantsOverview() {
  const db = await loadAll();
  return db.merchants.map((m) => {
    const own = db.transactions.filter((t) => t.merchantId === m.id && t.status === 'SUCCESS');
    const todays = own.filter((t) => isToday(t.createdAt));
    const settled = db.settlements.filter((s) => s.merchantId === m.id);

    return {
      ...publicMerchant(m),
      todaysSales: sumRupees(todays.map((t) => t.amount)),
      todaysCount: todays.length,
      lifetimeVolume: sumRupees(own.map((t) => t.amount)),
      transactionCount: own.length,
      settlementCount: settled.length,
      lastSettlementAt: settled.at(-1)?.createdAt ?? null,
    };
  });
}

export async function transactionsOverview({ limit = 100, merchantId, studentId } = {}) {
  const transactions = await readData(COLLECTIONS.transactions, []);
  let rows = [...transactions].reverse();
  if (merchantId) rows = rows.filter((t) => String(t.merchantId).toUpperCase() === merchantId.toUpperCase());
  if (studentId) rows = rows.filter((t) => String(t.studentId).toUpperCase() === studentId.toUpperCase());
  return rows.slice(0, limit);
}

export async function payoutsOverview() {
  const db = await loadAll();
  const pending = db.transactions.filter((t) => t.status === 'SUCCESS' && t.settlementStatus === 'PENDING');
  return {
    payouts: buildPayouts(db.merchants, pending),
    settlements: [...db.settlements].reverse().slice(0, 30),
    totalPending: sumRupees(db.merchants.map((m) => m.pendingReceivable)),
  };
}

/** Merchant-facing summary for the POS home screen. */
export async function merchantSummary(merchantId) {
  const db = await loadAll();
  const merchant = db.merchants.find((m) => String(m.id).toUpperCase() === String(merchantId).toUpperCase());
  if (!merchant) return null;

  const own = db.transactions.filter((t) => t.merchantId === merchant.id && t.status === 'SUCCESS');
  const todays = own.filter((t) => isToday(t.createdAt));
  const settlements = db.settlements.filter((s) => s.merchantId === merchant.id);

  return {
    merchant: publicMerchant(merchant),
    todaysSales: sumRupees(todays.map((t) => t.amount)),
    todaysCount: todays.length,
    lifetimeVolume: sumRupees(own.map((t) => t.amount)),
    pendingReceivable: merchant.pendingReceivable,
    pendingCount: own.filter((t) => t.settlementStatus === 'PENDING').length,
    transactions: [...own].reverse().slice(0, 25),
    settlements: [...settlements].reverse().slice(0, 15),
  };
}

/** Student-facing summary: wallet + a merged, time-sorted ledger. */
export async function studentSummary(studentId) {
  const db = await loadAll();
  const student = db.students.find((s) => String(s.id).toUpperCase() === String(studentId).toUpperCase());
  if (!student) return null;

  const charges = db.transactions
    .filter((t) => t.studentId === student.id && t.status === 'SUCCESS')
    .map((t) => ({
      id: t.id,
      kind: 'CHARGE',
      direction: 'DEBIT',
      amount: t.amount,
      title: t.merchantName,
      subtitle: t.note || 'Campus purchase',
      balanceAfter: t.studentBalanceAfter,
      source: t.source,
      createdAt: t.createdAt,
    }));

  const topups = db.walletTransactions
    .filter((w) => w.studentId === student.id && w.status === 'SUCCESS')
    .map((w) => ({
      id: w.id,
      kind: 'TOPUP',
      direction: 'CREDIT',
      amount: w.amount,
      title: 'Wallet Top-up',
      subtitle: `${w.method} · ${w.paymentId}`,
      balanceAfter: w.balanceAfter,
      createdAt: w.createdAt,
    }));

  const ledger = [...charges, ...topups].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    student: publicStudent(student),
    ledger: ledger.slice(0, 50),
    totalSpent: sumRupees(charges.map((c) => c.amount)),
    totalToppedUp: sumRupees(topups.map((t) => t.amount)),
    transactionCount: charges.length,
  };
}
