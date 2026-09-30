/**
 * jsonDb — the entire persistence layer for UniPay.
 *
 * Design notes for a hackathon prototype:
 *  - Every collection is one JSON file under server/data.
 *  - Files are cached in memory after the first read, so reads are cheap and
 *    every request sees the same object graph.
 *  - Writes are atomic-ish: write to `<file>.tmp` then rename over the target.
 *    A crash mid-write leaves the previous good file intact.
 *  - `updateData` serialises mutations per-file through a promise chain, so two
 *    concurrent charges on the same student can never interleave a
 *    read-modify-write. This is the closest thing we have to a transaction and
 *    it is what keeps balances honest under the demo's concurrency.
 *
 * Production would replace this wholesale with a real database (see README).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * UNIPAY_DATA_DIR lets the tests point at a throwaway directory, and lets a
 * Render deployment point at a mounted persistent disk.
 */
export const DATA_DIR = process.env.UNIPAY_DATA_DIR
  ? path.resolve(process.env.UNIPAY_DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

/** In-memory cache: filename -> parsed contents. */
const cache = new Map();
/** Per-file mutation queue: filename -> promise of the last queued operation. */
const locks = new Map();

const filePath = (file) => path.join(DATA_DIR, file.endsWith('.json') ? file : `${file}.json`);

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Read a collection. Returns the live cached value — callers must not mutate it
 * directly; use `updateData` for anything that changes state.
 */
export async function readData(file, fallback = []) {
  const key = path.basename(filePath(file));
  if (cache.has(key)) return cache.get(key);

  try {
    const raw = await fs.readFile(filePath(file), 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : fallback;
    cache.set(key, parsed);
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      cache.set(key, fallback);
      await writeData(file, fallback);
      return fallback;
    }
    if (err instanceof SyntaxError) {
      // A corrupted file would otherwise crash every request. Park it and start
      // clean rather than taking the whole demo down.
      const broken = `${filePath(file)}.corrupt-${Date.now()}`;
      await fs.rename(filePath(file), broken).catch(() => {});
      console.error(`[jsonDb] ${key} was corrupt; moved to ${path.basename(broken)}`);
      cache.set(key, fallback);
      await writeData(file, fallback);
      return fallback;
    }
    throw err;
  }
}

/** Replace a collection wholesale and flush it to disk. */
export async function writeData(file, data) {
  await ensureDataDir();
  const target = filePath(file);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, target);
  cache.set(path.basename(target), data);
  return data;
}

/**
 * Serialised read-modify-write. `mutator(data)` may mutate `data` in place and
 * optionally return a value, which becomes the resolved value of this call.
 * Returning `SKIP_WRITE` aborts the flush (useful for no-op guards).
 */
export const SKIP_WRITE = Symbol('skipWrite');

export async function updateData(file, mutator, fallback = []) {
  const key = path.basename(filePath(file));
  const previous = locks.get(key) ?? Promise.resolve();

  const run = previous.then(async () => {
    const data = await readData(file, fallback);
    const result = await mutator(data);
    if (result === SKIP_WRITE) return undefined;
    await writeData(file, data);
    return result;
  });

  // Keep the chain alive even if this operation rejects, so one failed write
  // does not deadlock every later write to the same file.
  locks.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  );

  return run;
}

/**
 * Mutate several collections under one combined lock, in a deterministic file
 * order so two concurrent multi-file writes can never deadlock each other.
 * `mutator` receives an object keyed by the collection names.
 */
export async function updateMany(files, mutator) {
  const keys = [...new Set(files)].sort();
  const previous = Promise.all(keys.map((k) => locks.get(path.basename(filePath(k))) ?? Promise.resolve()));

  const run = previous.then(async () => {
    const collections = {};
    for (const k of keys) {
      collections[collectionName(k)] = await readData(k, []);
    }
    const result = await mutator(collections);
    if (result === SKIP_WRITE) return undefined;
    for (const k of keys) {
      await writeData(k, collections[collectionName(k)]);
    }
    return result;
  });

  const settled = run.then(
    () => undefined,
    () => undefined
  );
  for (const k of keys) locks.set(path.basename(filePath(k)), settled);

  return run;
}

const collectionName = (file) => path.basename(file, '.json');

/** Drop the in-memory cache — used by the demo reset so reads re-hit disk. */
export function invalidateCache(file) {
  if (file) cache.delete(path.basename(filePath(file)));
  else cache.clear();
}

export const COLLECTIONS = {
  students: 'students.json',
  merchants: 'merchants.json',
  admins: 'admins.json',
  transactions: 'transactions.json',
  walletTransactions: 'walletTransactions.json',
  settlements: 'settlements.json',
  paymentEvents: 'paymentEvents.json',
  counters: 'counters.json',
};
