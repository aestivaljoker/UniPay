/**
 * End-to-end test of the money path, against the real HTTP API.
 *
 * Runs against a throwaway data directory so it never touches demo data.
 * Set DATA_DIR before importing anything that touches jsonDb.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unipay-test-'));
process.env.UNIPAY_DATA_DIR = tmpDir;

const { createApp } = await import('../app.js');
const { seedIfEmpty, resetDemoData } = await import('../services/seedService.js');
const { COLLECTIONS, readData } = await import('../utils/jsonDb.js');
const { sumRupees } = await import('../utils/money.js');

let server;
let base;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

before(async () => {
  await seedIfEmpty();
  server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('UniPay end-to-end money flow', () => {
  let studentToken;
  let merchantToken;
  let adminToken;

  it('logs in all three roles with the demo credentials', async () => {
    const student = await api('POST', '/api/auth/student/login', {
      body: { email: 'devansh@unipay.demo', password: '123456' },
    });
    assert.equal(student.status, 200, JSON.stringify(student.body));
    assert.equal(student.body.profile.id, '24SCSE1010531');
    assert.equal(student.body.profile.passwordHash, undefined, 'password hash must never be returned');
    studentToken = student.body.token;

    const merchant = await api('POST', '/api/auth/merchant/login', {
      body: { email: 'canteen@unipay.demo', password: '123456' },
    });
    assert.equal(merchant.status, 200);
    merchantToken = merchant.body.token;

    const admin = await api('POST', '/api/auth/admin/login', {
      body: { email: 'admin@unipay.demo', password: 'admin123' },
    });
    assert.equal(admin.status, 200);
    adminToken = admin.body.token;
  });

  it('rejects a wrong password', async () => {
    const res = await api('POST', '/api/auth/student/login', {
      body: { email: 'devansh@unipay.demo', password: 'wrong' },
    });
    assert.equal(res.status, 401);
    assert.match(res.body.message, /Incorrect email or password/);
  });

  it('starts Devansh at the documented demo balance', async () => {
    const res = await api('GET', '/api/students/24SCSE1010531', { token: studentToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.student.walletBalance, 1000);
  });

  it('tops up the wallet through the simulated gateway', async () => {
    const res = await api('POST', '/api/payments/topup', {
      token: studentToken,
      body: { amount: 500, method: 'UPI', idempotencyKey: 'test-topup-1' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.student.walletBalance, 1500);
    assert.equal(res.body.simulated, true);
    assert.match(res.body.walletTransaction.paymentId, /^UPI-SIM-\d{6}$/);
  });

  it('refuses to replay the same top-up key', async () => {
    const res = await api('POST', '/api/payments/topup', {
      token: studentToken,
      body: { amount: 500, method: 'UPI', idempotencyKey: 'test-topup-1' },
    });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /already processed/i);

    const check = await api('GET', '/api/students/24SCSE1010531', { token: studentToken });
    assert.equal(check.body.student.walletBalance, 1500, 'balance must not double-credit');
  });

  it('rejects invalid top-up amounts', async () => {
    for (const amount of [0, -100, 'abc', null, Infinity]) {
      const res = await api('POST', '/api/payments/topup', {
        token: studentToken,
        body: { amount, method: 'UPI' },
      });
      assert.equal(res.status, 400, `amount ${amount} should be rejected`);
    }
  });

  it('resolves a scanned QR to the live wallet without trusting the QR', async () => {
    const qr = JSON.stringify({ type: 'UNIPAY_STUDENT', studentId: '24SCSE1010531', v: 1 });
    const res = await api('POST', '/api/payments/resolve-qr', { token: merchantToken, body: { qr } });
    assert.equal(res.status, 200);
    assert.equal(res.body.student.name, 'Devansh Ojha');
    assert.equal(res.body.student.walletBalance, 1500);
  });

  it('accepts the compact QR form too', async () => {
    const res = await api('POST', '/api/payments/resolve-qr', {
      token: merchantToken,
      body: { qr: 'UNIPAY:24SCSE1010531' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.student.id, '24SCSE1010531');
  });

  it('rejects a foreign QR code', async () => {
    const res = await api('POST', '/api/payments/resolve-qr', {
      token: merchantToken,
      body: { qr: 'https://example.com/not-unipay' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Invalid UniPay QR code/);
  });

  it('charges the student and creates a merchant receivable, not a payment', async () => {
    const before = await api('GET', '/api/merchants/CANTEEN001', { token: merchantToken });
    const receivableBefore = before.body.pendingReceivable;

    const res = await api('POST', '/api/payments/charge', {
      token: merchantToken,
      body: { studentId: '24SCSE1010531', amount: 150, note: 'Lunch thali', idempotencyKey: 'test-charge-1' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.student.walletBalance, 1350);
    assert.equal(res.body.transaction.settlementStatus, 'PENDING');
    assert.equal(res.body.merchant.pendingReceivable, receivableBefore + 150);
  });

  it('blocks a charge that exceeds the balance', async () => {
    // Inside the per-charge cap, but well above Devansh's ₹1,350 — this must be
    // stopped by the balance check, not by amount validation.
    const res = await api('POST', '/api/payments/charge', {
      token: merchantToken,
      body: { studentId: '24SCSE1010531', amount: 20000, idempotencyKey: 'test-charge-overdraft' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Insufficient wallet balance/);

    const check = await api('GET', '/api/students/24SCSE1010531', { token: studentToken });
    assert.equal(check.body.student.walletBalance, 1350, 'a failed charge must not move money');
  });

  it('never lets concurrent charges overdraw the wallet', async () => {
    // Balance is 1350. Fire ten 200-rupee charges at once: at most six can
    // succeed. Without the per-file lock this is where a race would show up.
    const attempts = Array.from({ length: 10 }, (_, i) =>
      api('POST', '/api/payments/charge', {
        token: merchantToken,
        body: { studentId: '24SCSE1010531', amount: 200, idempotencyKey: `race-${i}` },
      })
    );
    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r.status === 201).length;

    const check = await api('GET', '/api/students/24SCSE1010531', { token: studentToken });
    assert.ok(check.body.student.walletBalance >= 0, 'balance must never go negative');
    assert.equal(check.body.student.walletBalance, 1350 - succeeded * 200);
  });

  it('keeps merchant receivable equal to the sum of its pending transactions', async () => {
    const [merchants, transactions] = await Promise.all([
      readData(COLLECTIONS.merchants, []),
      readData(COLLECTIONS.transactions, []),
    ]);
    for (const merchant of merchants) {
      const pending = transactions.filter(
        (t) => t.merchantId === merchant.id && t.status === 'SUCCESS' && t.settlementStatus === 'PENDING'
      );
      assert.equal(
        merchant.pendingReceivable,
        sumRupees(pending.map((t) => t.amount)),
        `receivable mismatch for ${merchant.id}`
      );
    }
  });

  it('stops a merchant from charging into another merchant account', async () => {
    // merchantId comes from the session, so a forged body field is ignored.
    const res = await api('POST', '/api/payments/charge', {
      token: merchantToken,
      body: { studentId: '24SCSE1010874', merchantId: 'CAFE001', amount: 10, idempotencyKey: 'test-forge' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.transaction.merchantId, 'CANTEEN001');
  });

  it('stops a student reading another student wallet', async () => {
    const res = await api('GET', '/api/students/24SCSE1010874', { token: studentToken });
    assert.equal(res.status, 401);
  });

  it('rejects unauthenticated payment calls', async () => {
    const res = await api('POST', '/api/payments/charge', { body: { studentId: '24SCSE1010531', amount: 10 } });
    assert.equal(res.status, 401);
  });

  it('settles the merchant and zeroes the receivable', async () => {
    const before = await api('GET', '/api/merchants/CANTEEN001', { token: merchantToken });
    const owed = before.body.pendingReceivable;
    assert.ok(owed > 0, 'expected a pending receivable to settle');

    const res = await api('POST', '/api/settlements/CANTEEN001', {
      token: adminToken,
      body: { idempotencyKey: 'test-settle-1' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.settlement.amount, owed);
    assert.equal(res.body.settlement.status, 'COMPLETED');
    assert.equal(res.body.settlement.method, 'SIMULATED_BANK_TRANSFER');
    assert.equal(res.body.merchant.pendingReceivable, 0);
  });

  it('marks the settled transactions and refuses an empty second payout', async () => {
    const transactions = await readData(COLLECTIONS.transactions, []);
    const stillPending = transactions.filter(
      (t) => t.merchantId === 'CANTEEN001' && t.settlementStatus === 'PENDING'
    );
    assert.equal(stillPending.length, 0);

    const res = await api('POST', '/api/settlements/CANTEEN001', { token: adminToken, body: {} });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Nothing pending/i);
  });

  it('blocks a merchant from triggering their own payout', async () => {
    const res = await api('POST', '/api/settlements/CANTEEN001', { token: merchantToken, body: {} });
    assert.equal(res.status, 401);
  });

  it('syncs an offline-queued transaction exactly once', async () => {
    const items = [{ studentId: '24SCSE1010874', amount: 60, note: 'Offline chai', clientKey: 'queued-abc' }];

    const first = await api('POST', '/api/sync', { token: merchantToken, body: { items } });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.syncedCount, 1);
    assert.equal(first.body.results[0].status, 'SYNCED');
    assert.equal(first.body.results[0].transaction.source, 'OFFLINE_SYNC');

    // Replaying the same queue (a retried sync) must not charge twice.
    const second = await api('POST', '/api/sync', { token: merchantToken, body: { items } });
    assert.equal(second.status, 200);
    assert.equal(second.body.results[0].status, 'ALREADY_SYNCED');
    assert.equal(second.body.syncedCount, 0);
  });

  it('reports a per-item failure without discarding the rest of the batch', async () => {
    const res = await api('POST', '/api/sync', {
      token: merchantToken,
      body: {
        items: [
          { studentId: '24SCSE1010874', amount: 20, clientKey: 'batch-ok' },
          // Vikram only has ₹95.50 — within the cap, but he cannot cover it.
          { studentId: '23SCIV1050187', amount: 5000, clientKey: 'batch-overdraft' },
        ],
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.syncedCount, 1);
    assert.equal(res.body.failedCount, 1);
    assert.match(res.body.results[1].message, /Insufficient/);
  });

  it('serves an admin dashboard whose totals match the ledger', async () => {
    const res = await api('GET', '/api/admin/dashboard', { token: adminToken });
    assert.equal(res.status, 200);

    const students = await readData(COLLECTIONS.students, []);
    assert.equal(res.body.stats.totalStudents, students.length);
    assert.equal(res.body.stats.totalWalletBalance, sumRupees(students.map((s) => s.walletBalance)));

    const merchants = await readData(COLLECTIONS.merchants, []);
    assert.equal(res.body.stats.pendingPayout, sumRupees(merchants.map((m) => m.pendingReceivable)));
    assert.ok(Array.isArray(res.body.activity));
    assert.ok(res.body.charts.volumeByDay.length === 7);
  });

  it('keeps the admin dashboard off-limits to students', async () => {
    const res = await api('GET', '/api/admin/dashboard', { token: studentToken });
    assert.equal(res.status, 401);
  });

  it('signs up a new student and starts them at zero', async () => {
    const res = await api('POST', '/api/auth/student/signup', {
      body: { name: 'Test User', email: 'newbie@unipay.demo', studentId: '25SCSE1019999', password: 'secret1' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.profile.walletBalance, 0);
    assert.equal(res.body.profile.qrIdentifier, 'UNIPAY:25SCSE1019999');

    const dup = await api('POST', '/api/auth/student/signup', {
      body: { name: 'Copy', email: 'other@unipay.demo', studentId: '25SCSE1019999', password: 'secret1' },
    });
    assert.equal(dup.status, 409);
  });

  it('accepts a charge without a PIN by default (PIN is a UI-level step)', async () => {
    // Documents the default posture: the student PIN is enforced in the merchant
    // UI, not by this endpoint. Set REQUIRE_WALLET_PIN=true to enforce it here.
    const res = await api('POST', '/api/payments/charge', {
      token: merchantToken,
      body: { studentId: '24SCSE1010874', amount: 15, idempotencyKey: 'pin-default' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  it('survives a transient file lock during a write (OneDrive / antivirus)', async () => {
    // Regression: a sync client holding a handle made fs.rename fail with EPERM,
    // which surfaced as a 500 on a payment and silently broke the demo.
    // writeData must retry rather than propagate a transient OS lock.
    const fsPromises = (await import('node:fs/promises')).default;
    const realRename = fsPromises.rename;
    let calls = 0;

    fsPromises.rename = async (...args) => {
      calls += 1;
      if (calls <= 2) {
        const err = new Error('EPERM: operation not permitted, rename');
        err.code = 'EPERM';
        throw err;
      }
      return realRename(...args);
    };

    try {
      const res = await api('POST', '/api/payments/charge', {
        token: merchantToken,
        body: { studentId: '25SBSR1020903', amount: 30, idempotencyKey: 'eperm-retry' },
      });
      assert.equal(res.status, 201, `charge must survive a transient lock: ${JSON.stringify(res.body)}`);
      assert.ok(calls > 2, 'rename should have been retried');
    } finally {
      fsPromises.rename = realRename;
    }

    // And the retried write must actually be on disk, not just in memory.
    const { invalidateCache } = await import('../utils/jsonDb.js');
    invalidateCache();
    const reread = await readData(COLLECTIONS.transactions, []);
    assert.ok(
      reread.some((t) => t.studentId === '25SBSR1020903' && t.amount === 30),
      'the transaction must be persisted to disk after the retry'
    );
  });

  it('resets the demo back to the documented starting state', async () => {
    await resetDemoData();
    const students = await readData(COLLECTIONS.students, []);
    const devansh = students.find((s) => s.id === '24SCSE1010531');
    assert.equal(devansh.walletBalance, 1000);
    assert.equal(students.find((s) => s.id === '25SCSE1019999'), undefined, 'signups are cleared by reset');

    const merchants = await readData(COLLECTIONS.merchants, []);
    assert.equal(merchants.find((m) => m.id === 'CANTEEN001').pendingReceivable, 0);
  });
});
