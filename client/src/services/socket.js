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

  // Re-send the room identity on EVERY connect, including reconnects. This is
  // the only place `subscribe` is emitted, so a socket can never end up
  // connected-but-roomless — the bug that left the admin dashboard frozen
  // because it silently received nothing.
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

/**
 * Join the rooms for this role/account. Safe to call repeatedly, and safe to
 * call before or after the socket finishes connecting.
 *
 * Order matters here and used to be wrong. `identity` is set FIRST, so that if
 * `getSocket()` has to create the socket, its `connect` handler already has an
 * identity to send. Then, if the socket happens to be open already (a role
 * switch on a live connection), we emit immediately — otherwise `connect` will.
 * Either path joins the room; neither can silently skip it.
 */
export function subscribe(role, accountId) {
  identity = { role, accountId: accountId ?? null };
  const s = getSocket();
  if (s.connected) s.emit('subscribe', identity);
  return identity;
}

/**
 * Ensure the current identity is registered with the server.
 *
 * A page's data effect can run before `AuthProvider` has called `subscribe`
 * (React mounts children before parent effects settle on a restored session).
 * Dashboards call this from their own effect so they are never left listening
 * on a socket that belongs to no room.
 */
export function ensureSubscribed(role, accountId) {
  const next = { role, accountId: accountId ?? null };
  const changed = !identity || identity.role !== next.role || identity.accountId !== next.accountId;
  if (changed) return subscribe(role, accountId);

  // Identity already correct — re-assert it if the socket is up, in case the
  // original emit was lost mid-handshake.
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
