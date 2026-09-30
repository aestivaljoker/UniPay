import { Link } from 'react-router-dom';
import { DemoModeBadge, UniPayMark } from './Brand.jsx';

/** Shared chrome for the three login screens. */
export function AuthShell({ eyebrow, title, subtitle, children, demoCredentials }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-ink-950">
      <div className="pointer-events-none absolute inset-0 bg-admin-shell" />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 py-6 safe-top">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-slate-400 transition hover:text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            <span className="text-xs font-bold">Back</span>
          </Link>
          <DemoModeBadge />
        </div>

        <div className="flex flex-1 flex-col justify-center py-8">
          <div className="mb-8 animate-fade-up">
            <UniPayMark size={48} />
            <p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-mint-400">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate-400">{subtitle}</p>}
          </div>

          <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
            {children}
          </div>

          {demoCredentials && (
            <div
              className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 animate-fade-up"
              style={{ animationDelay: '160ms' }}
            >
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Demo credentials</p>
              <div className="mt-2.5 space-y-1.5">
                {demoCredentials.map((cred) => (
                  <button
                    key={cred.email}
                    type="button"
                    onClick={cred.onUse}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[12px] text-slate-300">{cred.email}</span>
                      <span className="block font-mono text-[11px] text-slate-500">{cred.password}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-brand-300">Use</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Segmented Log in / Sign up switch. */
export function AuthTabs({ mode, onChange }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-ink-900/60 p-1">
      {[
        ['login', 'Log in'],
        ['signup', 'Sign up'],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-lg py-2.5 text-sm font-bold transition ${
            mode === key ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-400 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-danger-500/35 bg-danger-500/10 px-4 py-3 animate-fade-up">
      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-danger-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <p className="text-sm font-semibold text-danger-400">{message}</p>
    </div>
  );
}

export function Field({ label, hint, ...props }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field" {...props} />
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}
