/**
 * The single source of truth for demo data.
 *
 * Both first-run seeding and the admin "RESET DEMO" button build from here, so
 * a reset always lands on exactly the state the demo script expects:
 *   Devansh:               ₹1,000.00
 *   Merchant receivables:  ₹0 for the primary canteen, non-zero elsewhere so the
 *                          admin "TO BE PAID" table is never empty on stage.
 *
 * Historical rows are generated relative to "now" so the dashboard's
 * today/7-day analytics always have something to plot, whenever you demo.
 */

import { addRupees, sumRupees } from '../utils/money.js';
import { buildStudentQrIdentifier } from '../utils/qr.js';

export const DEMO_PASSWORD = '123456';
export const ADMIN_PASSWORD = 'admin123';

const STUDENTS = [
  { id: 'GU2026DEV', name: 'Devansh Ojha', email: 'devansh@unipay.demo', balance: 1000, course: 'B.Tech CSE', year: 3 },
  { id: 'GU2026ANA', name: 'Ananya Sharma', email: 'ananya@unipay.demo', balance: 2450, course: 'B.Tech ECE', year: 2 },
  { id: 'GU2026ROH', name: 'Rohan Verma', email: 'rohan@unipay.demo', balance: 780.5, course: 'BBA', year: 1 },
  { id: 'GU2026PRI', name: 'Priya Nair', email: 'priya@unipay.demo', balance: 3120, course: 'B.Tech CSE', year: 4 },
  { id: 'GU2026KAR', name: 'Karan Mehta', email: 'karan@unipay.demo', balance: 145, course: 'B.Com', year: 2 },
  { id: 'GU2026SNE', name: 'Sneha Iyer', email: 'sneha@unipay.demo', balance: 1890, course: 'B.Sc Physics', year: 3 },
  { id: 'GU2026ADI', name: 'Aditya Rao', email: 'aditya@unipay.demo', balance: 560, course: 'B.Tech Mech', year: 2 },
  { id: 'GU2026ISH', name: 'Ishita Gupta', email: 'ishita@unipay.demo', balance: 4200, course: 'MBA', year: 1 },
  { id: 'GU2026VIK', name: 'Vikram Singh', email: 'vikram@unipay.demo', balance: 95.5, course: 'B.Tech Civil', year: 4 },
  { id: 'GU2026MEE', name: 'Meera Krishnan', email: 'meera@unipay.demo', balance: 2675, course: 'B.Des', year: 3 },
  { id: 'GU2026ARJ', name: 'Arjun Pillai', email: 'arjun@unipay.demo', balance: 1340, course: 'B.Tech IT', year: 1 },
  { id: 'GU2026TAN', name: 'Tanvi Deshmukh', email: 'tanvi@unipay.demo', balance: 3055, course: 'B.A Economics', year: 2 },
];

const MERCHANTS = [
  {
    id: 'CANTEEN001',
    shopName: 'Canteen Shop #1',
    ownerName: 'Rahul Kumar',
    email: 'canteen@unipay.demo',
    category: 'Food & Beverage',
    location: 'Academic Block A, Ground Floor',
    // Left at zero so the live demo's first charge is the only receivable on
    // this merchant — clean to point at on stage.
    seedReceivable: 0,
  },
  {
    id: 'CANTEEN002',
    shopName: 'Canteen Shop #2',
    ownerName: 'Sunita Patil',
    email: 'canteen2@unipay.demo',
    category: 'Food & Beverage',
    location: 'Hostel Mess Complex',
    seedReceivable: 2430,
  },
  {
    id: 'STATION001',
    shopName: 'Campus Stationery',
    ownerName: 'Imran Shaikh',
    email: 'stationery@unipay.demo',
    category: 'Stationery',
    location: 'Library Building',
    seedReceivable: 860,
  },
  {
    id: 'CAFE001',
    shopName: 'The Brew Point',
    ownerName: 'Neha Joshi',
    email: 'cafe@unipay.demo',
    category: 'Cafe',
    location: 'Innovation Centre',
    seedReceivable: 1685,
  },
  {
    id: 'XEROX001',
    shopName: 'Xerox & Print Hub',
    ownerName: 'Ganesh Yadav',
    email: 'xerox@unipay.demo',
    category: 'Print Services',
    location: 'Admin Block',
    seedReceivable: 495,
  },
  {
    id: 'JUICE001',
    shopName: 'Fresh Juice Corner',
    ownerName: 'Lakshmi Reddy',
    email: 'juice@unipay.demo',
    category: 'Food & Beverage',
    location: 'Sports Complex',
    seedReceivable: 1240,
  },
];

const ADMINS = [
  { id: 'ADMIN001', name: 'University Finance Office', email: 'admin@unipay.demo' },
];

const ITEM_NOTES = {
  'Food & Beverage': ['Lunch thali', 'Samosa & chai', 'Veg sandwich', 'Cold coffee', 'Poha plate', 'Masala dosa'],
  Cafe: ['Cappuccino', 'Brownie', 'Iced latte', 'Croissant'],
  Stationery: ['A4 notebook', 'Drawing kit', 'Pen set', 'Lab file'],
  'Print Services': ['Xerox 40 pages', 'Project binding', 'Colour printout', 'ID card print'],
};

/** Deterministic PRNG so a reset reproduces the same believable history. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the full demo dataset.
 * `hashPassword` is injected so this module stays free of bcrypt (the tests and
 * the reset endpoint both reuse it).
 */
export async function buildSeedData(hashPassword) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const rand = mulberry32(20260930);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

  const demoHash = await hashPassword(DEMO_PASSWORD);
  const adminHash = await hashPassword(ADMIN_PASSWORD);

  const students = STUDENTS.map((s, index) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    passwordHash: demoHash,
    walletBalance: s.balance,
    qrIdentifier: buildStudentQrIdentifier(s.id),
    course: s.course,
    year: s.year,
    status: 'ACTIVE',
    createdAt: iso(now - (90 - index) * 86400000),
  }));

  const merchants = MERCHANTS.map((m, index) => ({
    id: m.id,
    ownerName: m.ownerName,
    shopName: m.shopName,
    email: m.email,
    passwordHash: demoHash,
    pendingReceivable: 0, // recomputed below from the unsettled transactions
    lifetimeSettled: 0,
    category: m.category,
    location: m.location,
    status: 'ACTIVE',
    createdAt: iso(now - (120 - index * 5) * 86400000),
  }));

  const admins = ADMINS.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    passwordHash: adminHash,
    role: 'ADMIN',
    createdAt: iso(now - 200 * 86400000),
  }));

  const transactions = [];
  const walletTransactions = [];
  const settlements = [];
  const paymentEvents = [];

  let txnSeq = 0;
  let wtxSeq = 0;
  let stlSeq = 0;
  let evtSeq = 0;

  const nextTxn = () => `TXN-${String(++txnSeq).padStart(5, '0')}`;
  const nextWtx = () => `WTX-${String(++wtxSeq).padStart(5, '0')}`;
  const nextStl = () => `STL-${String(++stlSeq).padStart(5, '0')}`;
  const nextEvt = () => `EVT-${String(++evtSeq).padStart(6, '0')}`;

  // --- Historical wallet top-ups (so every student has a funding trail) ---
  for (const student of students) {
    const topupCount = randInt(1, 3);
    for (let i = 0; i < topupCount; i += 1) {
      const amount = pick([200, 500, 500, 1000, 1000, 2000]);
      const at = now - randInt(3, 45) * 86400000 - randInt(0, 20) * 3600000;
      const method = pick(['UPI', 'CARD', 'NETBANKING']);
      walletTransactions.push({
        id: nextWtx(),
        studentId: student.id,
        studentName: student.name,
        type: 'TOPUP',
        amount,
        balanceAfter: null, // historical rows: running balance not reconstructed
        status: 'SUCCESS',
        method,
        simulated: true,
        paymentId: `${method}-SIM-${randInt(100000, 999999)}`,
        gateway: 'UNIPAY_SIMULATED_GATEWAY',
        createdAt: iso(at),
      });
    }
  }

  // --- Historical merchant charges ---
  // Some are already settled (they get a settlementId), the rest stay pending so
  // the "TO BE PAID" table has realistic balances on first load.
  const pendingByMerchant = new Map(merchants.map((m) => [m.id, []]));

  const makeCharge = (student, merchant, amount, at, { settled }) => {
    const merchantMeta = MERCHANTS.find((m) => m.id === merchant.id);
    const txn = {
      id: nextTxn(),
      studentId: student.id,
      studentName: student.name,
      merchantId: merchant.id,
      merchantName: merchant.shopName,
      amount,
      status: 'SUCCESS',
      settlementStatus: settled ? 'SETTLED' : 'PENDING',
      settlementId: null,
      note: pick(ITEM_NOTES[merchantMeta.category] ?? ['Purchase']),
      studentBalanceAfter: null,
      source: 'ONLINE',
      createdAt: iso(at),
    };
    transactions.push(txn);
    if (!settled) pendingByMerchant.get(merchant.id).push(txn);
    return txn;
  };

  // Settled history: 4 to 8 charges per merchant, 10-40 days old.
  for (const merchant of merchants) {
    const count = randInt(4, 8);
    for (let i = 0; i < count; i += 1) {
      const student = pick(students);
      const amount = randInt(3, 60) * 10;
      const at = now - randInt(10, 40) * 86400000 - randInt(0, 23) * 3600000;
      makeCharge(student, merchant, amount, at, { settled: true });
    }
  }

  // Settlement batches for the settled history.
  for (const merchant of merchants) {
    const settledTxns = transactions.filter((t) => t.merchantId === merchant.id && t.settlementStatus === 'SETTLED' && !t.settlementId);
    if (!settledTxns.length) continue;
    const amount = sumRupees(settledTxns.map((t) => t.amount));
    const settledAt = now - randInt(2, 9) * 86400000;
    const settlement = {
      id: nextStl(),
      merchantId: merchant.id,
      merchantName: merchant.shopName,
      amount,
      transactionCount: settledTxns.length,
      transactionIds: settledTxns.map((t) => t.id),
      status: 'COMPLETED',
      method: 'SIMULATED_BANK_TRANSFER',
      simulated: true,
      reference: `PAYOUT-SIM-${randInt(100000, 999999)}`,
      initiatedBy: 'ADMIN001',
      createdAt: iso(settledAt),
      completedAt: iso(settledAt + 4000),
    };
    settlements.push(settlement);
    for (const t of settledTxns) t.settlementId = settlement.id;
    const m = merchants.find((x) => x.id === merchant.id);
    m.lifetimeSettled = addRupees(m.lifetimeSettled, amount);
  }

  // Pending history: hit each merchant's target seed receivable with charges
  // spread over the last 3 days (so "today's sales" is populated too).
  for (const meta of MERCHANTS) {
    const merchant = merchants.find((m) => m.id === meta.id);
    let remaining = meta.seedReceivable;
    let guard = 0;
    while (remaining > 0 && guard < 40) {
      guard += 1;
      const slice = remaining > 400 ? randInt(6, 35) * 10 : remaining;
      const amount = Math.min(slice, remaining);
      const daysAgo = randInt(0, 2);
      const at = now - daysAgo * 86400000 - randInt(1, 9) * 3600000;
      makeCharge(pick(students), merchant, amount, at, { settled: false });
      remaining = Math.round((remaining - amount) * 100) / 100;
    }
  }

  // Recompute receivables from the ledger rather than trusting the target — the
  // invariant "pendingReceivable === sum(pending transactions)" must hold from
  // the very first byte of data.
  for (const merchant of merchants) {
    merchant.pendingReceivable = sumRupees(pendingByMerchant.get(merchant.id).map((t) => t.amount));
  }

  // --- Activity feed backfill, newest last ---
  const recent = [...transactions]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-12);
  for (const txn of recent) {
    paymentEvents.push({
      id: nextEvt(),
      type: 'payment:studentCharged',
      title: 'PAYMENT',
      studentId: txn.studentId,
      studentName: txn.studentName,
      merchantId: txn.merchantId,
      merchantName: txn.merchantName,
      amount: txn.amount,
      status: 'SUCCESS',
      simulated: true,
      message: `${txn.studentName} paid ₹${txn.amount} to ${txn.merchantName}`,
      createdAt: txn.createdAt,
    });
  }
  paymentEvents.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  transactions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  walletTransactions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  settlements.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    students,
    merchants,
    admins,
    transactions,
    walletTransactions,
    settlements,
    paymentEvents,
    counters: {
      transaction: txnSeq,
      walletTransaction: wtxSeq,
      settlement: stlSeq,
      paymentEvent: evtSeq,
    },
  };
}
