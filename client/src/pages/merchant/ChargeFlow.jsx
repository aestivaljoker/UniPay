import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { QrScanner } from '../../components/QrScanner.jsx';
import { SimulatedTag, Spinner, SuccessCheck } from '../../components/Brand.jsx';
import { merchantApi } from '../../services/api.js';
import { avatarColor, formatINR, initials, newIdempotencyKey } from '../../utils/format.js';

/**
 * The merchant charge flow: scan → student found → amount → confirm → success.
 *
 * In OFFLINE DEMO mode the same flow runs, but the student is resolved from a
 * locally-cached lookup where possible and the charge is queued instead of sent.
 */

const QUICK_AMOUNTS = [20, 40, 50, 80, 100, 150, 200, 250];

export default function ChargeFlow({ open, onClose, offlineMode, onCharged, onQueued, knownStudents }) {
  const [step, setStep] = useState('scan'); // scan | student | confirm | processing | success | error
  const [student, setStudent] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualOpen, setManualOpen] = useState(false);

  const idempotencyKey = useRef(null);
  const resolvingRef = useRef(false);

  useEffect(() => {
    if (open) return undefined;
    const t = setTimeout(() => {
      setStep('scan');
      setStudent(null);
      setAmount('');
      setNote('');
      setError(null);
      setResult(null);
      setManualId('');
      setManualOpen(false);
      idempotencyKey.current = null;
      resolvingRef.current = false;
    }, 220);
    return () => clearTimeout(t);
  }, [open]);

  /** Turn a decoded QR string into a student, online or offline. */
  const resolveStudent = useCallback(
    async (rawQr) => {
      // The in-flight guard is a ref, not state. If it were state it would have
      // to be a dependency of this callback, the callback identity would change
      // on every scan, and QrScanner would restart the camera mid-lookup.
      if (resolvingRef.current) return;
      resolvingRef.current = true;
      setResolving(true);
      setError(null);

      try {
        if (offlineMode) {
          // No server: parse locally and match against students this terminal
          // has already seen. This is exactly the limitation an offline terminal
          // has — it can only recognise who it already knows about.
          const parsed = parseQrLocally(rawQr);
          if (!parsed) throw new Error('Invalid UniPay QR code.');

          const cached = knownStudents?.[parsed];
          setStudent({
            id: parsed,
            name: cached?.name ?? 'Unverified student',
            walletBalance: cached?.walletBalance ?? null,
            offlineUnverified: !cached,
          });
          setStep('student');
          return;
        }

        const res = await merchantApi.resolveQr(rawQr);
        setStudent(res.student);
        setStep('student');
      } catch (err) {
        setError(err.message);
        setStep('error');
      } finally {
        resolvingRef.current = false;
        setResolving(false);
      }
    },
    [offlineMode, knownStudents]
  );

  const submitManual = (e) => {
    e.preventDefault();
    const id = manualId.trim().toUpperCase();
    if (id.length < 3) {
      setError('Enter a valid Student ID.');
      return;
    }
    resolveStudent(`UNIPAY:${id}`);
  };

  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= 25000;
  // We only block on balance when we actually know it (online, or cached).
  const exceedsBalance =
    student?.walletBalance !== null && student?.walletBalance !== undefined && numericAmount > student.walletBalance;

  async function confirmCharge() {
    setError(null);

    if (offlineMode) {
      const entry = onQueued({
        studentId: student.id,
        studentName: student.name,
        amount: numericAmount,
        note,
      });
      setResult({ offline: true, entry });
      setStep('success');
      return;
    }

    setStep('processing');
    idempotencyKey.current = idempotencyKey.current ?? newIdempotencyKey('charge');

    try {
      const res = await merchantApi.charge({
        studentId: student.id,
        amount: numericAmount,
        note,
        idempotencyKey: idempotencyKey.current,
      });
      setResult(res);
      setStep('success');
      onCharged?.(res);
    } catch (err) {
      setError(err.message);
      setStep('error');
      // A new attempt after a failure is a genuinely new charge.
      idempotencyKey.current = null;
    }
  }

  const restart = () => {
    setStep('scan');
    setStudent(null);
    setAmount('');
    setNote('');
    setError(null);
    setResult(null);
    idempotencyKey.current = null;
    // Must clear, or a lookup that errored would leave the guard latched and
    // every later scan would be ignored.
    resolvingRef.current = false;
  };

  return (
    <Modal
      open={open}
      onClose={step === 'processing' ? undefined : onClose}
      dismissable={step !== 'processing'}
      title={
        { scan: 'Scan student QR', student: 'Student found', confirm: 'Confirm payment', error: 'Payment failed' }[step] ??
        null
      }
      subtitle={step === 'scan' ? (offlineMode ? 'Offline demo mode — payment will be queued' : 'Point the camera at their wallet QR') : null}
      size="sm"
    >
      {/* ---------- Scan ---------- */}
      {step === 'scan' && (
        <div className="space-y-4">
          {offlineMode && (
            <div className="flex items-start gap-2.5 rounded-xl border border-gold-500/35 bg-gold-500/10 px-4 py-3">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
              <p className="text-[11px] font-semibold leading-relaxed text-gold-400">
                Offline demo mode. The payment is stored on this device as PENDING SYNC and only reaches the campus
                server when you restore the connection.
              </p>
            </div>
          )}

          <QrScanner onScan={resolveStudent} paused={resolving} />

          {resolving && (
            <div className="flex items-center justify-center gap-2 text-sm font-bold text-brand-300">
              <Spinner className="h-4 w-4" /> Looking up wallet…
            </div>
          )}

          {/* Manual entry: a fallback, never the main demo path — but on stage a
              blocked camera must not end the presentation. */}
          {!manualOpen ? (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="w-full text-center text-[11px] font-bold text-slate-500 transition hover:text-slate-300"
            >
              Camera not working? Enter ID manually
            </button>
          ) : (
            <form onSubmit={submitManual} className="space-y-2">
              <label className="block">
                <span className="label">Student ID</span>
                <input
                  className="field font-mono uppercase"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="24SCSE1010531"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  autoFocus
                />
              </label>
              <button type="submit" className="btn-ghost w-full">
                Look up student
              </button>
            </form>
          )}
        </div>
      )}

      {/* ---------- Student found + amount ---------- */}
      {step === 'student' && student && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-850 p-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ${avatarColor(student.id)}`}>
              <span className="text-base font-black">{initials(student.name)}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black text-white">{student.name}</p>
              <p className="font-mono text-xs text-slate-400">{student.id}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">Balance</p>
              <p className="text-lg font-black tnum text-mint-400">
                {student.walletBalance === null ? '—' : formatINR(student.walletBalance, { decimals: 0 })}
              </p>
            </div>
          </div>

          {student.offlineUnverified && (
            <p className="rounded-lg bg-gold-500/10 px-3 py-2 text-[11px] font-semibold leading-relaxed text-gold-400">
              Balance cannot be verified while offline. The campus server will check it when this payment syncs, and may
              reject it.
            </p>
          )}

          <div>
            <span className="label">Amount to deduct</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-black text-slate-500">
                ₹
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
                className="field !py-5 !pl-11 !text-4xl !font-black tnum"
                min="1"
                max="25000"
              />
            </div>
            {exceedsBalance && (
              <p className="mt-1.5 text-[11px] font-bold text-danger-400">Insufficient wallet balance.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                className={`rounded-lg px-3 py-2 text-sm font-bold tnum transition ${
                  Number(amount) === value
                    ? 'bg-mint-500 text-ink-950'
                    : 'border border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/10'
                }`}
              >
                ₹{value}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="label">Item / note (optional)</span>
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lunch thali" maxLength={60} />
          </label>

          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={restart}>
              Rescan
            </button>
            <button
              type="button"
              className="btn-mint btn-lg flex-[2]"
              disabled={!amountValid || exceedsBalance}
              onClick={() => setStep('confirm')}
            >
              Charge student
            </button>
          </div>
        </div>
      )}

      {/* ---------- Confirm ---------- */}
      {step === 'confirm' && student && (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/10 bg-ink-850 p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Charging</p>
            <p className="mt-2 text-5xl font-black tnum text-white">{formatINR(numericAmount, { decimals: 0 })}</p>
            <p className="mt-2 text-sm font-bold text-slate-300">{student.name}</p>
            <p className="font-mono text-[11px] text-slate-500">{student.id}</p>
          </div>

          <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            {[
              ['Current balance', student.walletBalance === null ? 'Unknown (offline)' : formatINR(student.walletBalance)],
              [
                'Balance after',
                student.walletBalance === null ? '—' : formatINR(student.walletBalance - numericAmount),
              ],
              ['Your receivable', `+${formatINR(numericAmount)}`],
              ...(note ? [['Note', note]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <span className="text-right text-[13px] font-bold tnum text-slate-200">{value}</span>
              </div>
            ))}
          </div>

          <p className="rounded-lg bg-brand-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-brand-200">
            The university credits this to your <span className="font-bold">receivable</span>. You are paid out in a
            settlement batch, not per transaction.
          </p>

          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => setStep('student')}>
              Back
            </button>
            <button type="button" className="btn-mint btn-lg flex-[2]" onClick={confirmCharge}>
              {offlineMode ? 'Queue payment' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Processing ---------- */}
      {step === 'processing' && (
        <div className="flex flex-col items-center gap-5 py-10">
          <Spinner className="h-12 w-12 text-mint-400" />
          <p className="text-sm font-bold text-white">Processing payment…</p>
          <p className="text-[11px] text-slate-500">Debiting wallet on the campus server</p>
        </div>
      )}

      {/* ---------- Success ---------- */}
      {step === 'success' && (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          {result?.offline ? (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-500/15 ring-1 ring-gold-500/40 animate-pop-in">
                <svg viewBox="0 0 24 24" className="h-9 w-9 text-gold-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[.18em] text-gold-400">Payment queued</p>
                <p className="mt-2 text-5xl font-black tnum text-white">
                  {formatINR(result.entry.amount, { decimals: 0 })}
                </p>
                <p className="mt-1.5 text-sm font-bold text-slate-300">{result.entry.studentName}</p>
              </div>
              <span className="badge-gold">Pending sync</span>
              <p className="max-w-[270px] text-[11px] leading-relaxed text-slate-500">
                Stored on this device. Restore the connection to send it to the campus server.
              </p>
            </>
          ) : (
            <>
              <SuccessCheck />
              <div>
                <p className="text-[11px] font-black uppercase tracking-[.18em] text-mint-400">Payment successful</p>
                <p className="mt-2 text-5xl font-black tnum text-white">
                  {formatINR(result.transaction.amount, { decimals: 0 })}
                </p>
                <p className="mt-1.5 text-sm font-bold text-slate-300">{result.transaction.studentName}</p>
                <p className="text-xs text-slate-500">{result.transaction.merchantName}</p>
              </div>

              <div className="w-full space-y-2 rounded-xl border border-white/10 bg-ink-850 p-4 text-left">
                {[
                  ['Transaction', result.transaction.id],
                  ['Student balance', formatINR(result.student.walletBalance)],
                  ['Your receivable', formatINR(result.merchant.pendingReceivable)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                    <span className="font-mono text-[12px] font-bold tnum text-slate-200">{value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex w-full gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              Done
            </button>
            <button type="button" className="btn-primary flex-1" onClick={restart}>
              Next student
            </button>
          </div>
        </div>
      )}

      {/* ---------- Error ---------- */}
      {step === 'error' && (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-danger-500/15 ring-1 ring-danger-500/40 animate-pop-in">
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-danger-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <p className="text-sm font-bold text-white">{error}</p>
          <div className="flex w-full gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" onClick={restart}>
              Scan again
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Offline QR parsing — mirrors the server's contract in server/utils/qr.js. */
function parseQrLocally(raw) {
  const text = String(raw ?? '').trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type !== 'UNIPAY_STUDENT') return null;
      return normalise(parsed.studentId);
    } catch {
      return null;
    }
  }
  const match = /^UNIPAY:([A-Za-z0-9]{3,32})$/.exec(text);
  return match ? normalise(match[1]) : null;
}

function normalise(value) {
  const id = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return id.length >= 3 ? id : null;
}
