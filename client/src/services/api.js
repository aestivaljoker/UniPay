/**
 * API client.
 *
 * Base URL resolution, in priority order:
 *   1. VITE_API_URL           — explicit override (set this for LAN demos)
 *   2. same origin            — production build served by Express, or the Vite
 *                               dev proxy (see vite.config.js)
 *
 * Because of (2), the default LAN setup needs no .env at all: open the Vite dev
 * server at http://LAPTOP_IP:5173 on a phone and its /api calls are proxied to
 * the Express server. VITE_API_URL is there for when you want the phone to talk
 * to the backend directly.
 */

// `import.meta.env` is injected by Vite. Guarded so this module can also be
// imported by plain Node (tests, tooling) without throwing at load time.
const RAW_BASE = String(import.meta.env?.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

export const API_BASE = RAW_BASE;
export const apiUrl = (path) => `${API_BASE}${path}`;

const TOKEN_KEY = 'unipay.token';
const ROLE_KEY = 'unipay.role';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  getRole: () => {
    try {
      return localStorage.getItem(ROLE_KEY);
    } catch {
      return null;
    }
  },
  set: (token, role) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (role) localStorage.setItem(ROLE_KEY, role);
    } catch {
      /* private mode — session simply won't persist across reloads */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ROLE_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Error carrying the server's user-facing message and machine code. */
export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, path, body, { timeout = 15000 } = {}) {
  const token = tokenStore.get();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // A network failure here is exactly the campus-Wi-Fi scenario UniPay is
    // about, so it gets the specific copy from the spec rather than "failed to
    // fetch".
    throw new ApiError(
      err.name === 'AbortError' ? 'Central server timed out. Check your connection.' : 'Central server unavailable.',
      { code: 'NETWORK' }
    );
  } finally {
    clearTimeout(timer);
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    if (response.status === 401 && onUnauthorized) onUnauthorized(payload.code);
    throw new ApiError(payload.message || 'Something went wrong.', {
      status: response.status,
      code: payload.code,
    });
  }

  return payload;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body ?? {}, opts),
};

// --- Endpoint helpers -------------------------------------------------------

export const auth = {
  studentLogin: (email, password) => api.post('/api/auth/student/login', { email, password }),
  studentSignup: (data) => api.post('/api/auth/student/signup', data),
  merchantLogin: (email, password) => api.post('/api/auth/merchant/login', { email, password }),
  merchantSignup: (data) => api.post('/api/auth/merchant/signup', data),
  adminLogin: (email, password) => api.post('/api/auth/admin/login', { email, password }),
  me: () => api.get('/api/auth/me'),
  logout: () => api.post('/api/auth/logout'),
};

export const studentApi = {
  summary: (id) => api.get(`/api/students/${id}`),
  qr: (id) => api.get(`/api/students/${id}/qr`),
  topup: (amount, method, idempotencyKey) =>
    api.post('/api/payments/topup', { amount, method, idempotencyKey }, { timeout: 20000 }),
};

export const merchantApi = {
  summary: (id) => api.get(`/api/merchants/${id}`),
  resolveQr: (qr) => api.post('/api/payments/resolve-qr', { qr }),
  charge: (payload) => api.post('/api/payments/charge', payload, { timeout: 20000 }),
  sync: (items) => api.post('/api/sync', { items }, { timeout: 30000 }),
};

export const adminApi = {
  dashboard: () => api.get('/api/admin/dashboard'),
  students: () => api.get('/api/admin/students'),
  merchants: () => api.get('/api/admin/merchants'),
  transactions: (limit = 100) => api.get(`/api/admin/transactions?limit=${limit}`),
  payouts: () => api.get('/api/admin/payouts'),
  settle: (merchantId, idempotencyKey) =>
    api.post(`/api/settlements/${merchantId}`, { idempotencyKey }, { timeout: 20000 }),
  reset: () => api.post('/api/admin/reset', { confirm: 'RESET' }, { timeout: 30000 }),
};

export const health = () => api.get('/api/health', { timeout: 6000 });
