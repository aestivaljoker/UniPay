/**
 * The admin activity feed.
 *
 * Every financial action appends one row to paymentEvents.json so the admin
 * dashboard can render a feed even after a page reload (Socket.IO only carries
 * events that happen while you are connected).
 */

import { COLLECTIONS, updateData } from '../utils/jsonDb.js';
import { nextPaymentEventId } from '../utils/ids.js';

const MAX_EVENTS = 300; // keep the file small; the feed only ever shows recent rows

export async function recordEvent(event) {
  const id = await nextPaymentEventId();
  const row = {
    id,
    createdAt: new Date().toISOString(),
    simulated: true,
    ...event,
  };

  await updateData(COLLECTIONS.paymentEvents, (events) => {
    events.push(row);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  });

  return row;
}

export async function listEvents(limit = 50) {
  const { readData } = await import('../utils/jsonDb.js');
  const events = await readData(COLLECTIONS.paymentEvents, []);
  return [...events].reverse().slice(0, limit);
}
