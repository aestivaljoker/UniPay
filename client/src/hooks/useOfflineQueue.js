import { useCallback, useEffect, useState } from 'react';
import { newIdempotencyKey } from '../utils/format.js';

/**
 * OFFLINE DEMO MODE queue.
 *
 * PROTOTYPE SIMULATION — read this before trusting it with anything real.
 *
 * When the merchant flips to OFFLINE, charges are parked in localStorage with a
 * client-generated key instead of being sent to the server. On RESTORE
 * CONNECTION they are replayed to POST /api/sync, and the key makes that replay
 * idempotent, so a half-failed sync can be retried safely.
 *
 * What this does NOT do, and what a production system would need:
 *   - It cannot verify the student still has the balance. The server re-checks
 *     at sync time, so a queued payment CAN be rejected after the student has
 *     walked away with the samosa. Real offline stored value needs the balance
 *     to live on a signed, tamper-resistant credential (an NFC card's secure
 *     element), not in a phone's localStorage.
 *   - It offers no protection against double-spending across two offline
 *     terminals, because neither terminal can see the other.
 *   - localStorage is clearable by the user; a real terminal would use
 *     append-only encrypted storage with a device-bound key.
 */

const STORAGE_KEY = 'unipay.offline.queue';
const MODE_KEY = 'unipay.offline.mode';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the queue simply won't survive a reload */
  }
};

export function useOfflineQueue(merchantId) {
  const scopedQueueKey = `${STORAGE_KEY}.${merchantId}`;
  const scopedModeKey = `${MODE_KEY}.${merchantId}`;

  const [offlineMode, setOfflineMode] = useState(() => read(scopedModeKey, false) === true);
  const [queue, setQueue] = useState(() => read(scopedQueueKey, []));

  useEffect(() => write(scopedModeKey, offlineMode), [offlineMode, scopedModeKey]);
  useEffect(() => write(scopedQueueKey, queue), [queue, scopedQueueKey]);

  const enqueue = useCallback((item) => {
    const entry = {
      ...item,
      clientKey: newIdempotencyKey('q'),
      occurredAt: new Date().toISOString(),
      status: 'PENDING_SYNC',
    };
    setQueue((q) => [...q, entry]);
    return entry;
  }, []);

  const removeKeys = useCallback((keys) => {
    const set = new Set(keys);
    setQueue((q) => q.filter((item) => !set.has(item.clientKey)));
  }, []);

  /** Mark items the server rejected, so the merchant can see which and why. */
  const markFailed = useCallback((failures) => {
    const byKey = new Map(failures.map((f) => [f.clientKey, f.message]));
    setQueue((q) =>
      q.map((item) => (byKey.has(item.clientKey) ? { ...item, status: 'FAILED', error: byKey.get(item.clientKey) } : item))
    );
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

  const pending = queue.filter((item) => item.status !== 'FAILED');
  const failed = queue.filter((item) => item.status === 'FAILED');
  const pendingTotal = pending.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return {
    offlineMode,
    setOfflineMode,
    queue,
    pending,
    failed,
    pendingTotal,
    enqueue,
    removeKeys,
    markFailed,
    clearQueue,
  };
}
