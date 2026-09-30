import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { SimulatedTag, Spinner, SuccessCheck } from '../../components/Brand.jsx';
import { formatINR, newIdempotencyKey } from '../../utils/format.js';
import { studentApi } from '../../services/api.js';

/**
 * The simulated payment gateway.
 *
 * Staged deliberately so it reads like a real checkout: choose a method, watch
 * the connect → process → succeed sequence, then land on a receipt with a
 * payment reference. Every surface is stamped SIMULATED, and the request only
 * hits our own Express server — no external rail is contacted at any point.
 */

const METHODS = [
  {
    id: 'UPI',
    label: 'UPI',
    caption: 'Simulated · instant',
    icon: <path d="M12 2 3 12l9 10 9-10-9-10Z M12 7v10" />,
  },
  {
    id: 'CARD',
    label: 'Card',
    caption: 'Simulated debit / credit',
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </>
    ),
  },
  {
    id: 'NETBANKING',
    label: 'Net Banking',
    caption: 'Simulated bank redirect',
    icon: (
      <>
        <path d="M3 10h18L12 3 3 10Z" />
        <path d="M5 10v8M19 10v8M9 10v8M15 10v8M3 21h18" />
      </>
    ),
  },
];

const STAGES = [
  { key: 'connecting', label: 'Connecting to payment gateway…', ms: 1100 },
  { key: 'processing', label: 'Processing payment…', ms: 1300 },
  { key: 'confirming', label: 'Confirming with UniPay…', ms: 800 },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];

export default function PaymentGateway({ open, onClose, onSuccess }) {
  const [step, setStep] = useState('amount'); // amount | method | processing | success | failed
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // One key per attempt: a double-tap on PAY cannot credit the wallet twice.
  const idempotencyKey = useRef(null);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (!open) {
      // Reset after the close animation so the user doesn't see it snap back.
      const t = setTimeout(() => {
        setStep('amount');
        setAmount('');
        setMethod('UPI');
        setStageIndex(0);
        setResult(null);
        setError(null);
        idempotencyKey.current = null;
      }, 220);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount >= 10 && numericAmount <= 50000;

  async function runPayment() {
    setError(null);
    setStep('processing');
    setStageIndex(0);
    idempotencyKey.current = newIdempotencyKey('topup');

    // Walk the visual stages and fire the real request in parallel, so the
    // animation never outlasts a slow network — whichever finishes last wins.
    const stagePromise = new Promise((resolve) => {
      let elapsed = 0;
      STAGES.forEach((stage, i) => {
        elapsed += stage.ms;
        timers.current.push(setTimeout(() => setStageIndex(i + 1), elapsed));
      });
      timers.current.push(setTimeout(resolve, elapsed));
    });

    const requestPromise = studentApi.topup(numericAmount, method, idempotencyKey.current);

    try {
      const [, response] = await Promise.all([stagePromise, requestPromise]);
      clearTimers();
      setResult(response);
      setStep('success');
      onSuccess?.(response);
    } catch (err) {
      clearTimers();
      setError(err.message);
      setStep('failed');
    }
  }

  return (
    <Modal
      open={open}
      onClose={step === 'processing' ? undefined : onClose}
      dismissable={step !== 'processing'}
      title={step === 'success' ? null : 'UniPay Payment'}
      subtitle={step === 'success' ? null : 'Add money to wallet'}
      size="sm"
    >
      {/* ---------- Step 1: amount ---------- */}
      {step === 'amount' && (
        <div className="space-y-5">
          <div className="flex justify-center">
            <SimulatedTag label="Simulated payment gateway" />
          </div>

          <div>
            <span className="label">Amount to add</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-500">
                ₹
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500"
                autoFocus
                className="field !py-4 !pl-10 !text-3xl !font-black tnum"
                min="10"
                max="50000"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">Between ₹10 and ₹50,000 per top-up.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                className={`rounded-lg px-3.5 py-2 text-sm font-bold tnum transition ${
                  Number(amount) === value
                    ? 'bg-brand-500 text-white'
                    : 'border border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/10'
                }`}
              >
                ₹{value.toLocaleString('en-IN')}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-primary btn-lg w-full"
            disabled={!amountValid}
            onClick={() => setStep('method')}
          >
            Proceed to payment
          </button>
        </div>
      )}

      {/* ---------- Step 2: method ---------- */}
      {step === 'method' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/10 bg-ink-850 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Amount</p>
            <p className="mt-1 text-4xl font-black tnum text-white">{formatINR(numericAmount, { decimals: 0 })}</p>
            <SimulatedTag className="mt-2" />
          </div>

          <div>
            <span className="label">Payment method</span>
            <div className="space-y-2">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    method === m.id
                      ? 'border-brand-400 bg-brand-500/12 ring-1 ring-brand-400/40'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-brand-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {m.icon}
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">{m.label}</span>
                    <span className="block text-[11px] text-slate-500">{m.caption}</span>
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      method === m.id ? 'border-brand-400 bg-brand-400' : 'border-white/25'
                    }`}
                  >
                    {method === m.id && <span className="h-1.5 w-1.5 rounded-full bg-ink-950" />}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => setStep('amount')}>
              Back
            </button>
            <button type="button" className="btn-mint btn-lg flex-[2]" onClick={runPayment}>
              Pay {formatINR(numericAmount, { decimals: 0 })}
            </button>
          </div>

          <p className="text-center text-[10px] leading-relaxed text-slate-600">
            No real bank, UPI app or card network is contacted. This gateway is a prototype simulation.
          </p>
        </div>
      )}

      {/* ---------- Step 3: processing ---------- */}
      {step === 'processing' && (
        <div className="flex flex-col items-center gap-6 py-6">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 animate-pulse-ring rounded-full" />
            <Spinner className="h-12 w-12 text-brand-400" />
          </div>

          <div className="w-full space-y-2.5">
            {STAGES.map((stage, i) => {
              const done = i < stageIndex;
              const active = i === stageIndex;
              return (
                <div
                  key={stage.key}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                    active ? 'bg-brand-500/10' : ''
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      done ? 'bg-mint-500 text-ink-950' : active ? 'bg-brand-500 text-white' : 'bg-white/8 text-slate-600'
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : active ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span className={`text-sm font-semibold ${done ? 'text-slate-500' : active ? 'text-white' : 'text-slate-600'}`}>
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">Do not close this screen</p>
        </div>
      )}

      {/* ---------- Step 4: success ---------- */}
      {step === 'success' && result && (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <SuccessCheck />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.18em] text-mint-400">Payment successful</p>
            <p className="mt-2 text-5xl font-black tnum text-white">
              {formatINR(result.walletTransaction.amount, { decimals: 0 })}
            </p>
            <p className="mt-1.5 text-sm text-slate-400">added to your UniPay wallet</p>
          </div>

          <div className="w-full space-y-2 rounded-xl border border-white/10 bg-ink-850 p-4 text-left">
            {[
              ['New balance', formatINR(result.student.walletBalance)],
              ['Payment method', result.walletTransaction.method],
              ['Payment ID', result.walletTransaction.paymentId],
              ['Reference', result.walletTransaction.id],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <span className="font-mono text-[12px] font-bold tnum text-slate-200">{value}</span>
              </div>
            ))}
          </div>

          <SimulatedTag label="Simulated transaction" />

          <button type="button" className="btn-primary btn-lg w-full" onClick={onClose}>
            Done
          </button>
        </div>
      )}

      {/* ---------- Failure ---------- */}
      {step === 'failed' && (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-danger-500/15 ring-1 ring-danger-500/40 animate-pop-in">
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-danger-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.18em] text-danger-400">Payment failed</p>
            <p className="mt-2 text-sm text-slate-300">{error}</p>
          </div>
          <div className="flex w-full gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => setStep('method')}>
              Try again
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
