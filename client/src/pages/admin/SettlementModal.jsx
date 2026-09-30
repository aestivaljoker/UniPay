import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { SimulatedTag, Spinner, SuccessCheck } from '../../components/Brand.jsx';
import { adminApi } from '../../services/api.js';
import { formatINR, newIdempotencyKey, relativeTime } from '../../utils/format.js';

/**
 * SETTLE MERCHANT — the simulated bank transfer.
 * Confirm → processing → receipt, with the SIMULATED label on every stage so
 * nobody watching can mistake this for a real disbursement.
 */

const STAGES = [
  'Preparing payout instruction…',
  'Contacting simulated bank rail…',
  'Transferring to merchant account…',
  'Reconciling ledger…',
];

export default function SettlementModal({ payout, open, onClose, onSettled }) {
  const [step, setStep] = useState('confirm'); // confirm | processing | success | error
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const idempotencyKey = useRef(null);
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (open) return undefined;
    const t = setTimeout(() => {
      setStep('confirm');
      setStageIndex(0);
      setResult(null);
      setError(null);
      idempotencyKey.current = null;
    }, 220);
    return () => clearTimeout(t);
  }, [open]);

  async function runPayout() {
    setStep('processing');
    setStageIndex(0);
    setError(null);
    idempotencyKey.current = idempotencyKey.current ?? newIdempotencyKey('settle');

    const stagePromise = new Promise((resolve) => {
      let elapsed = 0;
      STAGES.forEach((_, i) => {
        elapsed += 620;
        timers.current.push(setTimeout(() => setStageIndex(i + 1), elapsed));
      });
      timers.current.push(setTimeout(resolve, elapsed));
    });

    try {
      const [, res] = await Promise.all([stagePromise, adminApi.settle(payout.merchantId, idempotencyKey.current)]);
      clearTimers();
      setResult(res);
      setStep('success');
      onSettled?.(res);
    } catch (err) {
      clearTimers();
      setError(err.message);
      setStep('error');
      idempotencyKey.current = null;
    }
  }

  if (!payout) return null;

  return (
    <Modal
      open={open}
      onClose={step === 'processing' ? undefined : onClose}
      dismissable={step !== 'processing'}
      title={step === 'confirm' ? 'Settle merchant' : step === 'error' ? 'Payout failed' : null}
      subtitle={step === 'confirm' ? 'Simulated bank transfer' : null}
      size="sm"
    >
      {step === 'confirm' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/10 bg-ink-850 p-5 text-center">
            <p className="text-base font-black text-white">{payout.shopName}</p>
            <p className="text-[11px] text-slate-500">
              {payout.ownerName} · <span className="font-mono">{payout.merchantId}</span>
            </p>
            <p className="mt-4 text-5xl font-black tnum text-gold-400">{formatINR(payout.amount, { decimals: 0 })}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Amount to be paid</p>
          </div>

          <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            {[
              ['Transactions', String(payout.transactionCount)],
              ['Oldest pending', payout.oldestPendingAt ? relativeTime(payout.oldestPendingAt) : '—'],
              ['Payment method', 'Simulated bank transfer'],
              ['Category', payout.category || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <span className="text-[13px] font-bold tnum text-slate-200">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <SimulatedTag label="Simulated merchant payout" />
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-lg flex-[2]" onClick={runPayout}>
              Confirm payout
            </button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <div className="flex flex-col items-center gap-6 py-6">
          <Spinner className="h-12 w-12 text-gold-400" />
          <div className="w-full space-y-2">
            {STAGES.map((label, i) => {
              const done = i < stageIndex;
              const active = i === stageIndex;
              return (
                <div key={label} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${active ? 'bg-gold-500/10' : ''}`}>
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      done ? 'bg-mint-500 text-ink-950' : active ? 'bg-gold-500 text-ink-950' : 'bg-white/8'
                    }`}
                  >
                    {done && (
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-[13px] font-semibold ${done ? 'text-slate-500' : active ? 'text-white' : 'text-slate-600'}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-600">Processing payout</p>
        </div>
      )}

      {step === 'success' && result && (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <SuccessCheck />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.18em] text-mint-400">Payout successful</p>
            <p className="mt-2 text-5xl font-black tnum text-white">
              {formatINR(result.settlement.amount, { decimals: 0 })}
            </p>
            <p className="mt-1.5 text-sm font-bold text-slate-300">paid to {result.settlement.merchantName}</p>
          </div>

          <div className="w-full space-y-2 rounded-xl border border-white/10 bg-ink-850 p-4 text-left">
            {[
              ['Settlement', result.settlement.id],
              ['Reference', result.settlement.reference],
              ['Transactions', String(result.settlement.transactionCount)],
              ['Receivable now', formatINR(result.merchant.pendingReceivable)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <span className="font-mono text-[12px] font-bold tnum text-slate-200">{value}</span>
              </div>
            ))}
          </div>

          <span className="badge-mint">Settled</span>

          <button type="button" className="btn-primary w-full" onClick={onClose}>
            Done
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-danger-500/15 ring-1 ring-danger-500/40">
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-danger-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <p className="text-sm font-bold text-white">{error}</p>
          <div className="flex w-full gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-primary flex-1" onClick={runPayout}>
              Retry
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
