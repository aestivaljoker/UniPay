/**
 * In-memory bearer-token sessions.
 *
 * Deliberately not JWT: no secret to manage, no signing key to leak, and a
 * server restart invalidates everything — all fine for a prototype. The
 * trade-off (sessions die on restart, and don't survive across multiple server
 * processes) is documented in the README.
 */

import { sessionToken } from '../utils/ids.js';
import { unauthorized } from '../utils/validate.js';

const sessions = new Map(); // token -> { role, accountId, email, createdAt, lastSeenAt }

const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — longer than any demo day

export function createSession({ role, accountId, email }) {
  const token = sessionToken();
  const now = Date.now();
  sessions.set(token, { role, accountId, email, createdAt: now, lastSeenAt: now });
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.lastSeenAt > TTL_MS) {
    sessions.delete(token);
    return null;
  }
  session.lastSeenAt = Date.now();
  return session;
}

export function destroySession(token) {
  return sessions.delete(token);
}

export function clearSessions() {
  sessions.clear();
}

/** Express middleware factory: `requireRole('STUDENT')`, `requireRole('ADMIN')`. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const session = getSession(token);

    if (!session) return next(unauthorized('Session expired. Please log in again.', 'SESSION_EXPIRED'));
    if (roles.length && !roles.includes(session.role)) {
      return next(unauthorized('Not authorised for this action.', 'ROLE_MISMATCH'));
    }

    req.auth = { ...session, token };
    next();
  };
}

/**
 * Guard against one account acting on another's data.
 * The route param is compared against the session's own account id.
 */
export function assertOwnAccount(req, accountId) {
  if (req.auth.role === 'ADMIN') return; // admin dashboard reads everything
  if (String(req.auth.accountId).toUpperCase() !== String(accountId).toUpperCase()) {
    throw unauthorized('Not authorised for this account.', 'ACCOUNT_MISMATCH');
  }
}
