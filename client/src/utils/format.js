/** Display formatting. Indian digit grouping everywhere. */

export function formatINR(amount, { decimals = 2, sign = false } = {}) {
  const n = Number(amount ?? 0);
  const body = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = sign ? (n < 0 ? '−' : '+') : n < 0 ? '−' : '';
  return `${prefix}₹${body}`;
}

/** Compact form for dashboard tiles: ₹8.4L, ₹1.2Cr. */
export function formatCompactINR(amount) {
  const n = Number(amount ?? 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatClock(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour12: false });
}

/** "Just now", "4m ago", "2h ago", then a date. */
export function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'Just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** Deterministic initials for avatar chips. */
export function initials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Stable colour per account id, so the same person is the same colour. */
const AVATAR_COLORS = [
  'bg-brand-500/25 text-brand-200 ring-brand-400/30',
  'bg-mint-500/20 text-mint-300 ring-mint-400/30',
  'bg-gold-500/20 text-gold-400 ring-gold-400/30',
  'bg-purple-500/20 text-purple-300 ring-purple-400/30',
  'bg-sky-500/20 text-sky-300 ring-sky-400/30',
  'bg-rose-500/20 text-rose-300 ring-rose-400/30',
];

export function avatarColor(seed) {
  const key = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Client-side idempotency key so a double-tap cannot charge twice. */
export function newIdempotencyKey(prefix = 'ui') {
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}
