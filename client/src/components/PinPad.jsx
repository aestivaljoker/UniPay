import { useEffect, useRef, useState } from 'react';
import { formatINR } from '../utils/format.js';

/**
 * Student wallet PIN entry, shown on the MERCHANT's device.
 *
 * ── PROTOTYPE SCOPE — READ BEFORE BELIEVING THIS SECURES ANYTHING ──
 *
 * This screen exists to demonstrate the *authorisation step* in the payment
 * flow: the person holding the wallet must consent to this specific amount
 * before it leaves their balance. Without it, a merchant who knows an admission
 * number could charge any student by typing it in manually.
 *
 * What this is NOT:
 *   - The PIN is a hard-coded demo value (2005) checked IN THE BROWSER. Anyone
 *     with devtools can bypass it, and the server does not know a PIN exists.
 *   - A real implementation must verify the PIN SERVER-SIDE against a per-student
 *     hash (bcrypt/argon2), rate-limit attempts, lock the wallet after N failures,
 *     and never let the merchant's device see or validate the secret.
 *   - Better still, the student approves on THEIR OWN device (a push prompt or a
 *     rotating token in the student app), so the PIN is never typed on hardware
 *     the merchant controls — which is how UPI and card PIN-on-glass actually work.
 *
 * The UI is deliberately built to be handed across the counter: large keys, a
 * masked display, and the amount restated so the student sees what they approve.
 */

const DEMO_PIN = '2005';
const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 3;

export function PinPad({ student, amount, merchantName, onSuccess, onCancel, onLockout }) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState(null);
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);

  const verifyTimer = useRef(null);
  useEffect(() => () => clearTimeout(verifyTimer.current), []);

  const remaining = MAX_ATTEMPTS - attempts;

  const press = (digit) => {
    if (checking || pin.length >= PIN_LENGTH) return;
    setError(null);
    setPin((p) => p + digit);
  };

  const backspace = () => {
    if (checking) return;
    setError(null);
    setPin((p) => p.slice(0, -1));
  };

  // Verify once the 4th digit lands — no separate "submit" tap, which is what
  // a real PIN terminal does.
  useEffect(() => {
    if (pin.length !== PIN_LENGTH || checking) return;

    setChecking(true);
    // A brief pause reads as "verifying" rather than an instant reject, and
    // stops the student feeling the keypad is arguing with them.
    verifyTimer.current = setTimeout(() => {
      if (pin === DEMO_PIN) {
        // Hand the PIN up so the charge request can carry it. The server
        // ignores it unless REQUIRE_WALLET_PIN is enabled, but sending it means
        // enabling that flag needs no client change.
        onSuccess(pin);
        return;
      }

      const next = attempts + 1;
      setAttempts(next);
      setPin('');
      setChecking(false);
      setShake(true);
      setTimeout(() => setShake(false), 420);

      if (next >= MAX_ATTEMPTS) {
        onLockout?.();
      } else {
        setError(`Incorrect PIN. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} left.`);
      }
    }, 420);
  }, [pin, checking, attempts, onSuccess, onLockout]);

  // Physical keyboard support — useful when demoing on a laptop.
  // Intentionally re-registered on each relevant change so the handler always
  // closes over current `pin` and `checking` values.
  useEffect(() => {
    const onKey = (e) => {
      if (checking) return;
      if (/^[0-9]$/.test(e.key)) {
        if (pin.length < PIN_LENGTH) {
          setError(null);
          setPin((p) => p + e.key);
        }
      } else if (e.key === 'Backspace') {
        setError(null);
        setPin((p) => p.slice(0, -1));
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pin.length, checking, onCancel]);

  return (
    <div className="space-y-5">
      {/* What is being approved — the student must see this, not just the PIN box */}
      <div className="rounded-xl border border-white/10 bg-ink-850 p-4 text-center">
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Approve payment of</p>
        <p className="mt-1.5 text-4xl font-black tnum text-white">{formatINR(amount, { decimals: 0 })}</p>
        <p className="mt-2 text-[13px] font-bold text-slate-300">to {merchantName}</p>
        <div className="mt-3 border-t border-white/8 pt-3">
          <p className="text-[12px] font-bold text-white">{student.name}</p>
          <p className="font-mono text-[11px] text-slate-500">{student.id}</p>
        </div>
      </div>

      {/* Hand-over prompt */}
      <div className="flex items-start gap-2.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z" />
        </svg>
        <p className="text-[11px] font-semibold leading-relaxed text-brand-200">
          Hand the device to the student. Only they should enter this PIN.
        </p>
      </div>

      {/* Masked PIN display */}
      <div className={`flex justify-center gap-3 ${shake ? 'animate-shake' : ''}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <span
              key={i}
              className={`flex h-14 w-12 items-center justify-center rounded-xl border-2 text-2xl font-black transition-all ${
                error
                  ? 'border-danger-500/50 bg-danger-500/10'
                  : filled
                    ? 'border-brand-400 bg-brand-500/15 text-white'
                    : 'border-white/12 bg-ink-850'
              }`}
            >
              {filled ? <span className="h-3 w-3 rounded-full bg-brand-300" /> : null}
            </span>
          );
        })}
      </div>

      <div className="min-h-[20px] text-center">
        {checking && <p className="text-[12px] font-bold text-brand-300">Verifying…</p>}
        {error && !checking && <p className="text-[12px] font-bold text-danger-400">{error}</p>}
        {!error && !checking && (
          <p className="text-[11px] text-slate-500">
            Enter your 4-digit wallet PIN
            {remaining < MAX_ATTEMPTS ? ` · ${remaining} attempts left` : ''}
          </p>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <PinKey key={d} onClick={() => press(d)} disabled={checking}>
            {d}
          </PinKey>
        ))}
        <PinKey onClick={onCancel} disabled={checking} variant="muted">
          Cancel
        </PinKey>
        <PinKey onClick={() => press('0')} disabled={checking}>
          0
        </PinKey>
        <PinKey onClick={backspace} disabled={checking || !pin.length} variant="muted" aria-label="Delete">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM18 9l-6 6M12 9l6 6" />
          </svg>
        </PinKey>
      </div>

      {/* The demo hint. Honest about what this is. */}
      <div className="rounded-lg border border-gold-500/25 bg-gold-500/10 px-3 py-2.5 text-center">
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-gold-400">Demo PIN — 2005</p>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          Prototype only: checked in the browser, not on the server. A real wallet verifies a per-student PIN
          server-side, or approves on the student's own device.
        </p>
      </div>
    </div>
  );
}

function PinKey({ children, onClick, disabled, variant = 'default', ...rest }) {
  const base =
    'flex items-center justify-center rounded-xl text-xl font-black transition active:scale-95 disabled:opacity-35 disabled:pointer-events-none';
  const tone =
    variant === 'muted'
      ? 'border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] !text-[13px]'
      : 'border border-white/12 bg-ink-850 text-white hover:bg-white/[0.08]';

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${tone}`} style={{ minHeight: 58 }} {...rest}>
      {children}
    </button>
  );
}
