import { formatClock, formatINR, relativeTime } from '../../utils/format.js';

/**
 * The live activity feed — the panel the judges watch.
 * Each event type gets its own colour and icon so a glance tells you what
 * happened, and brand-new rows arrive with a highlight.
 */

const STYLES = {
  'payment:topup': {
    tone: 'text-mint-300',
    ring: 'ring-mint-500/30 bg-mint-500/10',
    label: 'Payment received',
    icon: <path d="M12 19V5M5 12l7-7 7 7" />,
  },
  'payment:studentCharged': {
    tone: 'text-brand-300',
    ring: 'ring-brand-500/30 bg-brand-500/10',
    label: 'Campus payment',
    icon: (
      <>
        <path d="M3 9h18l-1.4 9.3a2 2 0 0 1-2 1.7H6.4a2 2 0 0 1-2-1.7L3 9Z" />
        <path d="M8 9V6a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  'merchant:payout': {
    tone: 'text-gold-400',
    ring: 'ring-gold-500/30 bg-gold-500/10',
    label: 'Merchant payout',
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
  },
  'sync:completed': {
    tone: 'text-purple-300',
    ring: 'ring-purple-500/30 bg-purple-500/10',
    label: 'Offline sync',
    icon: <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-8-5M3 12a9 9 0 0 1 9-9 9 9 0 0 1 8 5M21 3v5h-5M3 21v-5h5" />,
  },
};

const FALLBACK = { tone: 'text-slate-300', ring: 'ring-white/15 bg-white/[0.06]', label: 'Event', icon: <circle cx="12" cy="12" r="4" /> };

export function LiveActivityFeed({ events = [], freshIds = new Set() }) {
  if (!events.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.05]">
          <span className="h-2 w-2 animate-pulse-ring rounded-full bg-mint-400" />
        </span>
        <p className="text-sm font-bold text-slate-300">Listening for activity</p>
        <p className="max-w-[240px] text-[11px] leading-relaxed text-slate-500">
          Top-ups, payments and payouts appear here the instant they happen.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/[0.06]">
      {events.map((event) => {
        const style = STYLES[event.type] ?? FALLBACK;
        const fresh = freshIds.has(event.id);

        return (
          <li
            key={event.id}
            className={`relative flex gap-3 px-4 py-3 transition-colors ${fresh ? 'animate-flash-row' : ''}`}
          >
            {fresh && <span className="absolute left-0 top-0 h-full w-0.5 bg-mint-400" />}

            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${style.ring} ${style.tone}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {style.icon}
              </svg>
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`text-[10px] font-black uppercase tracking-[.12em] ${style.tone}`}>
                  {event.title || style.label}
                </p>
                <p className="shrink-0 font-mono text-[10px] text-slate-600">{formatClock(event.createdAt)}</p>
              </div>

              <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-200">{event.message}</p>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {event.amount !== undefined && event.amount !== null && (
                  <span className="text-[12px] font-black tnum text-white">{formatINR(event.amount, { decimals: 0 })}</span>
                )}
                {event.paymentId && <Meta label={event.paymentId} />}
                {event.reference && <Meta label={event.reference} />}
                {event.transactionId && <Meta label={event.transactionId} />}
                {event.balanceAfter !== undefined && event.balanceAfter !== null && (
                  <Meta label={`wallet ${formatINR(event.balanceAfter, { decimals: 0 })}`} />
                )}
                {event.source === 'OFFLINE_SYNC' && (
                  <span className="text-[9px] font-black uppercase tracking-wider text-gold-400">offline</span>
                )}
                <span className="text-[10px] text-slate-600">{relativeTime(event.createdAt)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Meta({ label }) {
  return <span className="font-mono text-[10px] text-slate-500">{label}</span>;
}
