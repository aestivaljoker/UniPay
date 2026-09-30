/** Seeding + demo reset. */

import bcrypt from 'bcryptjs';
import { COLLECTIONS, ensureDataDir, invalidateCache, readData, writeData } from '../utils/jsonDb.js';
import { buildSeedData } from '../data/seedDefinition.js';
import { clearSessions } from './sessionService.js';

// 8 rounds: bcrypt is intentionally slow, and seeding hashes a password for
// every account. 8 is still far beyond plaintext while keeping first boot quick.
const SEED_ROUNDS = 8;

const hashPassword = (plain) => bcrypt.hash(plain, SEED_ROUNDS);

async function applySeed() {
  await ensureDataDir();
  const data = await buildSeedData(hashPassword);

  invalidateCache();
  await writeData(COLLECTIONS.students, data.students);
  await writeData(COLLECTIONS.merchants, data.merchants);
  await writeData(COLLECTIONS.admins, data.admins);
  await writeData(COLLECTIONS.transactions, data.transactions);
  await writeData(COLLECTIONS.walletTransactions, data.walletTransactions);
  await writeData(COLLECTIONS.settlements, data.settlements);
  await writeData(COLLECTIONS.paymentEvents, data.paymentEvents);
  await writeData(COLLECTIONS.counters, data.counters);

  return data;
}

/** Seed only when the store is empty — safe to call on every boot. */
export async function seedIfEmpty() {
  await ensureDataDir();
  const students = await readData(COLLECTIONS.students, []);
  if (Array.isArray(students) && students.length > 0) {
    return { seeded: false, students: students.length };
  }
  const data = await applySeed();
  return { seeded: true, students: data.students.length };
}

/**
 * Wipe and rebuild the demo state.
 * Sessions are cleared too: after a reset the old student records are replaced,
 * so any live token would point at an account that no longer has the same
 * balance history. Everyone logs back in, which is what the demo script expects.
 */
export async function resetDemoData() {
  const data = await applySeed();
  clearSessions();
  return {
    students: data.students.length,
    merchants: data.merchants.length,
    transactions: data.transactions.length,
    settlements: data.settlements.length,
    walletTransactions: data.walletTransactions.length,
  };
}

export { hashPassword };
