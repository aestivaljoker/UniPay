/**
 * Socket.IO client singleton.
 *
 * One connection is shared across the app. `subscribe(role, accountId)` tells
 * the server which rooms this device belongs in, and is re-sent on every
 * reconnect so a dropped Wi-Fi link recovers without a page reload.
 */

import { io } from 'socket.io-client';
import { API_BASE } from './api.js';

let socket = null;
let identity = null;

export function getSocket() {
  if (socket) return socket;

  // Empty API_BASE means same-origin (Vite proxy or the Express-served build),
  // which is what socket.io-client assumes when given no URL.
  socket = API_BASE ? io(API_BASE, socketOptions()) : io(socketOptions());

  socket.on('connect', () => {
    if (identity) socket.emit('subscribe', identity);
  });

  return socket;
}

function socketOptions() {
  return {
    // Start on polling and let it upgrade: some campus networks and Android
    // browsers refuse a cold websocket handshake, and a failed upgrade is
    // recoverable while a failed initial connect is not.
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    reconnectionDelayMax: 4000,
    timeout: 10000,
  };
}

/** Join the rooms for this role/account. Safe to call repeatedly. */
export function subscribe(role, accountId) {
  identity = { role, accountId: accountId ?? null };
  const s = getSocket();
  if (s.connected) s.emit('subscribe', identity);
  return identity;
}

/**
 * Attach handlers and get back a single cleanup function.
 * `handlers` is a map of event name -> callback.
 */
export function onEvents(handlers) {
  const s = getSocket();
  const entries = Object.entries(handlers);
  for (const [event, handler] of entries) s.on(event, handler);
  return () => {
    for (const [event, handler] of entries) s.off(event, handler);
  };
}

export function disconnectSocket() {
  identity = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
