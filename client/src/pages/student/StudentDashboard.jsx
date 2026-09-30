import { useCallback, useEffect, useRef, useState } from 'react';
import { DemoModeBadge, LiveDot, Spinner, UniPayMark } from '../../components/Brand.jsx';
import { Modal } from '../../components/Modal.jsx';
import { QrCode } from '../../components/QrCode.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConnection } from '../../hooks/useConnection.js';
import { studentApi } from '../../services/api.js';
import { ensureSubscribed, onEvents } from '../../services/socket.js';
import { avatarColor, formatINR, initials, relativeTime } from '../../utils/format.js';
import PaymentGateway from './PaymentGateway.jsx';

export default function StudentDashboard() {
  const { profile, patchProfile, signOut } = useAuth();
  const toast = useToast();
  const { connected } = useConnection();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState(null);
  // Transaction ids that arrived over the socket, so they can flash once.
  const [freshIds, setFreshIds] = useState(new Set());

  const balanceRef = useRef(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const data = await studentApi.summary(profile.id);
        setSummary(data);
        patchProfile({ walletBalance: data.student.walletBalance });
      } catch (err) {
        if (!silent) toast.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    [profile.id, patchProfile, toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Live updates.
   *
   * A charge taken on the merchant's phone must land here without a refresh —
   * that is half the demo. We refetch rather than patching state by hand so the
   * balance the student sees is always the server's number, never a local guess.
   */
  useEffect(() => {
    // Claim student:<id> before wiring handlers — see socket.js:subscribe.
    ensureSubscribed('STUDENT', profile.id);

    const markFresh = (id) => {
      if (!id) return;
      setFreshIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setFreshIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 2600);
    };

    return onEvents({
      'wallet:updated': (payload) => {
        if (payload.studentId !== profile.id) return;
        patchProfile({ walletBalance: payload.balance });
        balanceRef.current?.classList.remove('animate-pop-in');
        // Force the animation to replay on every update.
        void balanceRef.current?.offsetWidth;
        balanceRef.current?.classList.add('animate-pop-in');
        load({ silent: true });
      },
      'payment:studentCharged': (payload) => {
        if (payload.student?.id !== profile.id) return;
        markFresh(payload.transaction.id);
        toast.warn(`${formatINR(payload.transaction.amount)} paid at ${payload.transaction.merchantName}`, {
          title: 'Payment made',
        });
      },
      'transaction:new': (payload) => markFresh(payload.transaction?.id),
      'demo:reset': () => {
        toast.info('Demo data was reset by the admin. Please log in again.');
        signOut({ notifyServer: false });
      },
    });
  }, [profile.id, patchProfile, load, toast, signOut]);

  async function openQr() {
    setQrOpen(true);
    if (qrData) return;
    try {
      setQrData(await studentApi.qr(profile.id));
    } catch (err) {
      toast.error(err.message);
      setQrOpen(false);
    }
  }

  const balance = profile.walletBalance ?? 0;
  const ledger = summary?.ledger ?? [];

  return (
    <div className="min-h-[100dvh] bg-ink-950 pb-8">
      {/* --- Header --- */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-ink-950/85 backdrop-blur-xl safe-top">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <UniPayMark size={30} />
            <div className="min-w-0">
              <p className="text-sm font-black tracking-[.18em] text-white">UNIPAY</p>
              <p className="truncate text-[10px] font-semibold text-slate-500">{profile.course || 'Student wallet'}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LiveDot connected={connected} />
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-white/8 hover:text-white"
              aria-label="Log out"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        {/* --- Greeting --- */}
        <div className="flex items-center justify-between gap-3 animate-fade-up">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">Hello,</p>
            <h1 className="truncate text-2xl font-black tracking-tight text-white">
              {profile.name?.split(' ')[0] ?? 'Student'}
            </h1>
          </div>
          <DemoModeBadge />
        </div>

        {/* --- Wallet card --- */}
        <section
          className="relative overflow-hidden rounded-3xl bg-wallet-card p-6 shadow-lift animate-fade-up"
          style={{ animationDelay: '60ms' }}
        >
          {/* Decorative card texture */}
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/[0.07] blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-mint-400/12 blur-2xl" />

          <div className="relative">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-white/60">Campus Wallet</p>
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/40" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 8.5h20M6 15h4" strokeLinecap="round" />
                <rect x="2" y="4" width="20" height="16" rx="3" />
              </svg>
            </div>

            <p ref={balanceRef} className="mt-3 text-[44px] font-black leading-none tnum text-white animate-pop-in">
              {formatINR(balance)}
            </p>

            <div className="mt-6 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-white/50">Your UniPay ID</p>
                <p className="mt-1 font-mono text-base font-bold tracking-wider text-white">{profile.id}</p>
              </div>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ${avatarColor(profile.id)}`}>
                <span className="text-sm font-black">{initials(profile.name)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* --- Primary actions --- */}
        <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <button type="button" className="btn-mint btn-lg flex-col !gap-1" onClick={() => setGatewayOpen(true)}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add money
          </button>
          <button type="button" className="btn-primary btn-lg flex-col !gap-1" onClick={openQr}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3zM19 19h2v2h-2z" />
            </svg>
            Show my QR
          </button>
        </div>

        {/* --- Spend summary --- */}
        {summary && (
          <div className="grid grid-cols-3 gap-2.5 animate-fade-up" style={{ animationDelay: '170ms' }}>
            {[
              ['Topped up', formatINR(summary.totalToppedUp, { decimals: 0 }), 'text-mint-300'],
              ['Spent', formatINR(summary.totalSpent, { decimals: 0 }), 'text-brand-300'],
              ['Payments', String(summary.transactionCount), 'text-slate-200'],
            ].map(([label, value, tone]) => (
              <div key={label} className="card px-3 py-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-[.12em] text-slate-500">{label}</p>
                <p className={`mt-1 text-base font-black tnum ${tone}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* --- Transactions --- */}
        <section className="animate-fade-up" style={{ animationDelay: '220ms' }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="panel-title">Recent transactions</h2>
            <button
              type="button"
              onClick={() => load()}
              className="text-[11px] font-bold text-brand-300 transition hover:text-brand-200"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16" />
              ))}
            </div>
          ) : ledger.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 px-5 py-10 text-center">
              <svg viewBox="0 0 24 24" className="h-9 w-9 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3 7l2-4h14l2 4M9 12h6" />
              </svg>
              <p className="text-sm font-bold text-slate-300">No transactions yet</p>
              <p className="max-w-[240px] text-xs text-slate-500">
                Add money to your wallet, then pay at any campus shop with your QR.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {ledger.map((entry) => {
                const credit = entry.direction === 'CREDIT';
                return (
                  <li
                    key={entry.id}
                    className={`card flex items-center gap-3 px-4 py-3 ${freshIds.has(entry.id) ? 'animate-flash-row' : ''}`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        credit ? 'bg-mint-500/15 text-mint-400' : 'bg-brand-500/15 text-brand-300'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {credit ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
                      </svg>
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{entry.title}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {entry.subtitle}
                        {entry.source === 'OFFLINE_SYNC' && (
                          <span className="ml-1.5 font-bold text-gold-400">· offline sync</span>
                        )}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-black tnum ${credit ? 'text-mint-400' : 'text-white'}`}>
                        {credit ? '+' : '−'}
                        {formatINR(entry.amount, { decimals: 0 }).replace('₹', '₹')}
                      </p>
                      <p className="text-[10px] text-slate-500">{relativeTime(entry.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="pt-2 text-center text-[10px] leading-relaxed text-slate-600">
          UniPay is a closed-loop campus wallet prototype. All balances and payments are simulated.
        </p>
      </main>

      {/* --- Payment gateway --- */}
      <PaymentGateway
        open={gatewayOpen}
        onClose={() => setGatewayOpen(false)}
        onSuccess={(res) => {
          patchProfile({ walletBalance: res.student.walletBalance });
          load({ silent: true });
        }}
      />

      {/* --- QR sheet --- */}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="Your UniPay ID" subtitle="Show this to the shopkeeper" size="sm">
        {!qrData ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7 text-brand-400" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* White plate: maximum contrast for the scanning phone. */}
            <div className="rounded-2xl bg-white p-4 shadow-lift">
              <QrCode value={qrData.payload} size={248} />
            </div>

            <div className="text-center">
              <p className="font-mono text-lg font-black tracking-[.14em] text-white">{qrData.studentId}</p>
              <p className="mt-0.5 text-sm font-bold text-slate-300">{qrData.name}</p>
            </div>

            <div className="w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Wallet balance</p>
              <p className="mt-0.5 text-2xl font-black tnum text-mint-400">{formatINR(qrData.balance)}</p>
            </div>

            <p className="max-w-[280px] text-center text-[10px] leading-relaxed text-slate-600">
              This QR contains only your student ID — never your balance. The shop looks up your wallet on the campus
              server at the moment of payment.
            </p>

            <button type="button" className="btn-ghost w-full" onClick={() => setQrOpen(false)}>
              Close
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
