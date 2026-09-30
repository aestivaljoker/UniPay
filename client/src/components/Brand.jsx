/** Brand marks and the demo-mode chrome that must appear on every screen. */

export function UniPayMark({ size = 36, className = '' }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="upmark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4B5FE8" />
          <stop offset="100%" stopColor="#2A379B" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#upmark)" />
      {/* A "U" that doubles as a wallet opening, with a mint tap-dot. */}
      <path d="M20 17v17a12 12 0 0 0 24 0V17" stroke="#fff" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="48" r="4.5" fill="#3FE3A5" />
    </svg>
  );
}

export function UniPayWordmark({ size = 34, subtitle, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <UniPayMark size={size} />
      <div className="leading-none">
        <p className="text-lg font-black tracking-[.2em] text-white">UNIPAY</p>
        {subtitle && <p className="mt-1 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

/**
 * The DEMO MODE chip. Non-negotiable on every screen: nothing in this app moves
 * real money, and the UI must never let a viewer forget that.
 */
export function DemoModeBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-gold-500/35 bg-gold-500/12
                  px-2.5 py-1 text-[9px] font-black uppercase tracking-[.16em] text-gold-400 ${className}`}
      title="All money in UniPay is simulated. No real payment rail is contacted."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
      Demo Mode
    </span>
  );
}

/** Labels a specific operation as simulated (gateway, payout). */
export function SimulatedTag({ label = 'Simulated', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-gold-500/12 px-2 py-0.5
                  text-[9px] font-bold uppercase tracking-[.14em] text-gold-400 ring-1 ring-inset ring-gold-500/25 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      {label}
    </span>
  );
}

/** Pulsing LIVE dot for the admin command centre. */
export function LiveDot({ connected = true, label = 'LIVE' }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[.18em]
        ${connected ? 'bg-mint-500/12 text-mint-300 ring-1 ring-inset ring-mint-500/30' : 'bg-danger-500/12 text-danger-400 ring-1 ring-inset ring-danger-500/30'}`}
    >
      <span className={`relative flex h-2 w-2 ${connected ? 'animate-pulse-ring rounded-full' : ''}`}>
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-mint-400' : 'bg-danger-500'}`} />
      </span>
      {connected ? label : 'OFFLINE'}
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Animated tick used by every success state. */
export function SuccessCheck({ size = 84 }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full bg-mint-500/15 ring-1 ring-mint-400/40 animate-pop-in"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 52 52" width={size * 0.55} height={size * 0.55} fill="none" aria-hidden="true">
        <path
          d="M14 27l8 8 16-17"
          stroke="#3FE3A5"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="60"
          className="animate-draw-check"
        />
      </svg>
    </div>
  );
}
