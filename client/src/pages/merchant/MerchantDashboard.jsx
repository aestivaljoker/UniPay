import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DemoModeBadge, LiveDot, SimulatedTag, Spinner, UniPayMark } from '../../components/Brand.jsx';
import { Modal } from '../../components/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConnection } from '../../hooks/useConnection.js';
import { useOfflineQueue } from '../../hooks/useOfflineQueue.js';
import { merchantApi } from '../../services/api.js';
import { onEvents } from '../../services/socket.js';
import { avatarColor, formatINR, initials, relativeTime } from '../../utils/format.js';
import ChargeFlow from './ChargeFlow.jsx';

const TABS = [
  ['transactions', 'Transactions'],
  ['settlements', 'Payouts'],
];

export default function MerchantDashboard() {
  const { profile, patchProfile, signOut } = useAuth();
  const toast = useToast();
  const { connected } = useConnection();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [tab, setTab] = useState('transactions');
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState(null);
  const [freshIds, setFreshIds] = useState(new Set());

  const queue = useOfflineQueue(profile.id);
  // Students this terminal has already seen, so an offline scan can still show
  // a name instead of "Unverified student".
  const knownStudents = useRef({});

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const data = await merchantApi.summary(profile.id);
        setSummary(data);
        patchProfile({ pendingReceivable: data.pendingReceivable });
        for (const txn of data.transactions ?? []) {
          knownStudents.current[txn.studentId] ??= { name: txn.studentName };
        }
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

  useEffect(() => {
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
      'payment:studentCharged': (payload) => {
        if (payload.merchant?.id !== profile.id) return;
        markFresh(payload.transaction.id);
        load({ silent: true });
      },
      'merchant:receivableUpdated': (payload) => {
        if (payload.merchantId !== profile.id) return;
        patchProfile({ pendingReceivable: payload.pendingReceivable });
        load({ silent: true });
      },
      'merchant:payout': (payload) => {
        if (payload.merchant?.id !== profile.id) return;
        toast.success(`${formatINR(payload.settlement.amount)} paid out by the university`, { title: 'Payout received' });
        load({ silent: true });
      },
      'demo:reset': () => {
        toast.info('Demo data was reset by the admin. Please log in again.');
        queue.clearQueue();
        signOut({ notifyServer: false });
      },
    });
  }, [profile.id, patchProfile, load, toast, signOut, queue]);

  /** Replay the offline queue against the server. */
  async function restoreConnection() {
    if (!queue.pending.length) {
      queue.setOfflineMode(false);
      toast.success('Back online');
      return;
    }

    setSyncing(true);
    setSyncReport(null);

    try {
      const items = queue.pending.map((item) => ({
        studentId: item.studentId,
        amount: item.amount,
        note: item.note,
        clientKey: item.clientKey,
        occurredAt: item.occurredAt,
      }));

      const res = await merchantApi.sync(items);

      const settled = res.results.filter((r) => r.status === 'SYNCED' || r.status === 'ALREADY_SYNCED');
      const failures = res.results.filter((r) => r.status === 'FAILED');

      queue.removeKeys(settled.map((r) => r.clientKey));
      if (failures.length) queue.markFailed(failures);

      setSyncReport({ synced: settled.length, failed: failures.length, failures });
      queue.setOfflineMode(false);
      await load({ silent: true });

      if (failures.length) toast.warn(`${settled.length} synced, ${failures.length} rejected by the server`);
      else toast.success(`${settled.length} transaction${settled.length === 1 ? '' : 's'} synchronised`);
    } catch (err) {
      toast.error(err.message);
      setSyncReport({ error: err.message });
    } finally {
      setSyncing(false);
    }
  }

  const pendingReceivable = profile.pendingReceivable ?? summary?.pendingReceivable ?? 0;
  const rows = useMemo(
    () => (tab === 'transactions' ? (summary?.transactions ?? []) : (summary?.settlements ?? [])),
    [tab, summary]
  );

  return (
    <div className="min-h-[100dvh] bg-ink-950 pb-8">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-ink-950/85 backdrop-blur-xl safe-top">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <UniPayMark size={30} />
            <div className="min-w-0">
              <p className="text-sm font-black tracking-[.16em] text-white">UNIPAY</p>
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-mint-400">Merchant</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LiveDot connected={connected && !queue.offlineMode} />
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
        <div className="flex items-start justify-between gap-3 animate-fade-up">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight text-white">{profile.shopName}</h1>
            <p className="truncate text-xs text-slate-500">
              {profile.location || profile.category} · <span className="font-mono">{profile.id}</span>
            </p>
          </div>
          <DemoModeBadge />
        </div>

        {/* --- Online / Offline switch --- */}
        <button
          type="button"
          onClick={() => (queue.offlineMode ? restoreConnection() : queue.setOfflineMode(true))}
          disabled={syncing}
          className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition animate-fade-up ${
            queue.offlineMode
              ? 'border-danger-500/40 bg-danger-500/10'
              : 'border-mint-500/30 bg-mint-500/[0.07] hover:bg-mint-500/12'
          }`}
          style={{ animationDelay: '40ms' }}
        >
          <span className={`h-3 w-3 shrink-0 rounded-full ${queue.offlineMode ? 'bg-danger-500' : 'bg-mint-400 animate-pulse-ring'}`} />
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-black ${queue.offlineMode ? 'text-danger-400' : 'text-mint-300'}`}>
              {syncing ? 'Syncing…' : queue.offlineMode ? 'Offline demo mode' : 'Online'}
            </span>
            <span className="block text-[11px] text-slate-400">
              {queue.offlineMode
                ? `${queue.pending.length} payment${queue.pending.length === 1 ? '' : 's'} queued · tap to restore connection`
                : 'Connected to the campus server · tap to simulate a network drop'}
            </span>
          </span>
          {syncing ? (
            <Spinner className="h-5 w-5 text-mint-400" />
          ) : (
            <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider ${queue.offlineMode ? 'text-danger-400' : 'text-slate-500'}`}>
              {queue.offlineMode ? 'Restore' : 'Go offline'}
            </span>
          )}
        </button>

        {/* --- Stats --- */}
        <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="card p-4">
            <p className="panel-title">Today's sales</p>
            <p className="mt-1.5 text-2xl font-black tnum text-white">
              {formatINR(summary?.todaysSales ?? 0, { decimals: 0 })}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">{summary?.todaysCount ?? 0} payments</p>
          </div>
          <div className="card border-gold-500/25 bg-gold-500/[0.06] p-4">
            <p className="panel-title !text-gold-400/80">Pending receivable</p>
            <p className="mt-1.5 text-2xl font-black tnum text-gold-400">{formatINR(pendingReceivable, { decimals: 0 })}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{summary?.pendingCount ?? 0} awaiting payout</p>
          </div>
        </div>

        {/* --- Scan CTA --- */}
        <button
          type="button"
          onClick={() => setChargeOpen(true)}
          className="group relative w-full overflow-hidden rounded-2xl bg-mint-grad p-6 text-ink-950 shadow-mint transition active:scale-[.98] animate-fade-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink-950/15">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3zM19 19h2v2h-2z" />
              </svg>
            </span>
            <span className="flex-1 text-left">
              <span className="block text-xl font-black">Scan student</span>
              <span className="block text-[13px] font-semibold opacity-70">Open the camera and take a payment</span>
            </span>
            <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 transition group-active:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
        </button>

        {/* --- Offline queue --- */}
        {queue.queue.length > 0 && (
          <section className="card border-gold-500/25 p-4 animate-fade-up">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="panel-title !text-gold-400/80">Offline queue</h2>
              <span className="badge-gold">{formatINR(queue.pendingTotal, { decimals: 0 })} pending</span>
            </div>
            <ul className="space-y-2">
              {queue.queue.map((item) => (
                <li
                  key={item.clientKey}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                    item.status === 'FAILED' ? 'bg-danger-500/10' : 'bg-white/[0.04]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{item.studentName}</p>
                    <p className="truncate text-[10px] text-slate-500">
                      {item.status === 'FAILED' ? item.error : `Queued ${relativeTime(item.occurredAt)}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-black tnum text-white">
                    {formatINR(item.amount, { decimals: 0 })}
                  </span>
                  <span className={`shrink-0 ${item.status === 'FAILED' ? 'badge-danger' : 'badge-gold'}`}>
                    {item.status === 'FAILED' ? 'Rejected' : 'Pending sync'}
                  </span>
                </li>
              ))}
            </ul>
            {queue.failed.length > 0 && (
              <button type="button" onClick={queue.clearQueue} className="mt-3 w-full text-[11px] font-bold text-slate-500 hover:text-slate-300">
                Clear queue
              </button>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
              Prototype simulation of offline reconciliation. The server re-checks every balance on sync, so a queued
              payment can still be rejected.
            </p>
          </section>
        )}

        {/* --- History --- */}
        <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-ink-900/60 p-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-lg py-2 text-xs font-bold transition ${
                  tab === key ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-16" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="card px-5 py-10 text-center">
              <p className="text-sm font-bold text-slate-300">
                {tab === 'transactions' ? 'No payments yet' : 'No payouts yet'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {tab === 'transactions' ? 'Scan a student QR to take your first payment.' : 'The university settles your receivable in batches.'}
              </p>
            </div>
          ) : tab === 'transactions' ? (
            <ul className="space-y-2">
              {rows.map((txn) => (
                <li
                  key={txn.id}
                  className={`card flex items-center gap-3 px-4 py-3 ${freshIds.has(txn.id) ? 'animate-flash-row' : ''}`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${avatarColor(txn.studentId)}`}>
                    <span className="text-[11px] font-black">{initials(txn.studentName)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{txn.studentName}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {txn.note || txn.id} · {relativeTime(txn.createdAt)}
                      {txn.source === 'OFFLINE_SYNC' && <span className="ml-1 font-bold text-gold-400">· synced</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tnum text-mint-400">+{formatINR(txn.amount, { decimals: 0 })}</p>
                    <span className={txn.settlementStatus === 'SETTLED' ? 'badge-mint' : 'badge-gold'}>
                      {txn.settlementStatus === 'SETTLED' ? 'Paid out' : 'Pending'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2">
              {rows.map((s) => (
                <li key={s.id} className="card px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">{formatINR(s.amount)}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {s.transactionCount} transactions · {relativeTime(s.completedAt ?? s.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="badge-mint">Settled</span>
                      <p className="mt-1 font-mono text-[10px] text-slate-600">{s.reference}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex justify-center pt-2">
          <SimulatedTag label="All payments simulated" />
        </div>
      </main>

      <ChargeFlow
        open={chargeOpen}
        onClose={() => setChargeOpen(false)}
        offlineMode={queue.offlineMode}
        knownStudents={knownStudents.current}
        onCharged={(res) => {
          knownStudents.current[res.student.id] = { name: res.student.name, walletBalance: res.student.walletBalance };
          patchProfile({ pendingReceivable: res.merchant.pendingReceivable });
          load({ silent: true });
        }}
        onQueued={queue.enqueue}
      />

      {/* --- Sync report --- */}
      <Modal open={Boolean(syncReport)} onClose={() => setSyncReport(null)} title="Synchronisation complete" size="sm">
        {syncReport?.error ? (
          <p className="text-sm text-danger-400">{syncReport.error}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-ink-850 p-4">
              <div className="flex-1 text-center">
                <p className="text-3xl font-black tnum text-mint-400">{syncReport?.synced ?? 0}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Synced</p>
              </div>
              <div className="h-10 w-px bg-white/10" />
              <div className="flex-1 text-center">
                <p className={`text-3xl font-black tnum ${syncReport?.failed ? 'text-danger-400' : 'text-slate-600'}`}>
                  {syncReport?.failed ?? 0}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Rejected</p>
              </div>
            </div>

            {syncReport?.failures?.length > 0 && (
              <div className="space-y-1.5">
                <p className="panel-title">Rejected by the server</p>
                {syncReport.failures.map((f) => (
                  <p key={f.clientKey} className="rounded-lg bg-danger-500/10 px-3 py-2 text-[11px] font-semibold text-danger-400">
                    {f.message}
                  </p>
                ))}
              </div>
            )}

            <button type="button" className="btn-primary w-full" onClick={() => setSyncReport(null)}>
              Done
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
