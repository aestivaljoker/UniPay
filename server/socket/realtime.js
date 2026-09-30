/**
 * Socket.IO hub.
 *
 * Rooms:
 *   admin              — every admin dashboard
 *   student:<id>       — one student's devices
 *   merchant:<id>      — one merchant's devices
 *
 * Clients declare who they are with a `subscribe` message after connecting.
 * Emissions always go to the admin room plus the specific parties involved, so
 * the laptop sees everything while phones only get their own traffic.
 */

import { Server } from 'socket.io';

let io = null;

export function initRealtime(httpServer, { corsOrigin }) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: false },
    // Polling stays enabled as a fallback: some campus Wi-Fi and Android
    // browsers block raw websocket upgrades, and a silent realtime failure on
    // stage is the worst possible outcome.
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', (payload = {}) => {
      const role = String(payload.role ?? '').toUpperCase();
      const accountId = String(payload.accountId ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

      // Leave any previously joined rooms so a role switch on the same tab does
      // not leak another account's events.
      for (const room of socket.rooms) {
        if (room !== socket.id) socket.leave(room);
      }

      if (role === 'ADMIN') socket.join('admin');
      else if (role === 'STUDENT' && accountId) socket.join(`student:${accountId}`);
      else if (role === 'MERCHANT' && accountId) socket.join(`merchant:${accountId}`);

      socket.emit('subscribed', { role, accountId, rooms: [...socket.rooms].filter((r) => r !== socket.id) });
    });

    socket.on('ping:check', () => socket.emit('pong:check', { at: new Date().toISOString() }));
  });

  return io;
}

export function getIo() {
  return io;
}

/**
 * Emit one logical event to the admin room and to any named participants.
 * Safe to call before Socket.IO is initialised (tests import the services
 * directly) — it simply becomes a no-op.
 */
export function emitEvent(event, payload, { studentId, merchantId } = {}) {
  if (!io) return;
  const targets = io.to('admin');
  if (studentId) targets.to(`student:${String(studentId).toUpperCase()}`);
  if (merchantId) targets.to(`merchant:${String(merchantId).toUpperCase()}`);
  targets.emit(event, payload);
}

/** Broadcast to every connected client regardless of room (reset, stats). */
export function broadcast(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

export function connectionCount() {
  return io ? io.engine.clientsCount : 0;
}
