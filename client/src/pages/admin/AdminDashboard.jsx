import { useCallback, useEffect, useRef, useState } from 'react';
import { DemoModeBadge, LiveDot, SimulatedTag, Spinner, UniPayMark } from '../../components/Brand.jsx';
import { Modal } from '../../components/Modal.jsx';
import { HourlyChart, TopMerchantsChart, VolumeChart } from '../../components/charts/Charts.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useConnection } from '../../hooks/useConnection.js';
import { adminApi } from '../../services/api.js';
import { ensureSubscribed, onEvents } from '../../services/socket.js';
import { avatarColor, formatCompactINR, formatINR, initials, relativeTime } from '../../utils/format.js';
import { LiveActivityFeed } from './LiveActivityFeed.jsx';
import SettlementModal from './SettlementModal.jsx';

const SECTIONS = [
  ['overview', 'Overview', 'M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6ZM13 9h8V3h-8v6Z'],
  ['payouts', 'To Be Paid', 'M2 7h20v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 0 2-4h16l2 4M8 12h8'],
  ['students', 'Students', 'M12 3 2 8l10 5 10-5-10-5ZM6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5'],
  ['merchants', 'Merchants', 'M3 9h18l-1.4 9.3a2 2 0 0 1-2 1.7H6.4a2 2 0 0 1-2-1.7L3 9ZM8 9V6a4 4 0 0 1 8 0v3'],
  ['transactions', 'Transactions', 'M4 6h16M4 12h16M4 18h10'],
];

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const toast = useToast();
  const { connected } = useConnection();

  const [section, setSection] = useState('overview');
  const [snapshot, setSnapshot] = useState(null);
  const [students, setStudents] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [activePayout, setActivePayout] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [freshEventIds, setFreshEventIds] = useState(new Set());
  const [freshTxnIds, setFreshTxnIds] = useState(new Set());

  // Coalesces bursts of socket events into one refetch.
  const refetchTimer = useRef(null);

  const loadAll = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const [dash, st, me, tx] = await Promise.all([
          adminApi.dashboard(),
          adminApi.students(),
          adminApi.merchants(),
          adminApi.transactions(150),
        ]);
        setSnapshot(dash);
        setStudents(st.students);
        setMerchants(me.merchants);
        setTransactions(tx.transactions);
      } catch (err) {
        if (!silent) toast.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /** Debounced refetch so ten rapid events cause one round-trip, not ten. */
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => loadAll({ silent: true }), 350);
  }, [loadAll]);

  useEffect(() => () => clearTimeout(refetchTimer.current), []);

  /**
   * Live wiring. Events are prepended to the feed immediately for instant
   * feedback, then a debounced refetch reconciles every number with the server.
   */
  useEffect(() => {
    // Claim the admin room before wiring handlers. Without this the dashboard
    // could sit connected but in no room, receiving nothing and looking frozen.
    ensureSubscribed('ADMIN', profile?.id);

    const pushEvent = (event) => {
      if (!event) return;
      setSnapshot((prev) =>
        prev
          ? { ...prev, activity: [event, ...prev.activity.filter((e) => e.id !== event.id)].slice(0, 60) }
          : prev
      );
      setFreshEventIds((prev) => new Set(prev).add(event.id));
      setTimeout(() => {
        setFreshEventIds((prev) => {
          const next = new Set(prev);
          next.delete(event.id);
          return next;
        });
      }, 2800);
    };

    const markTxn = (id) => {
      if (!id) return;
      setFreshTxnIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setFreshTxnIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 2800);
    };

    return onEvents({
      'payment:topup': (payload) => {
        pushEvent(payload.event);
        scheduleRefetch();
      },
      'payment:studentCharged': (payload) => {
        pushEvent(payload.event);
        markTxn(payload.transaction?.id);
        scheduleRefetch();
      },
      'merchant:payout': (payload) => {
        pushEvent(payload.event);
        scheduleRefetch();
      },
      'sync:completed': (payload) => {
        pushEvent(payload.event);
        scheduleRefetch();
      },
      'admin:accountCreated': (payload) => {
        toast.info(`New ${payload.role.toLowerCase()} registered: ${payload.account.name ?? payload.account.shopName}`);
        scheduleRefetch();
      },
      'stats:dirty': scheduleRefetch,
      // Any event at all means the ledger moved; refetch even if it is an event
      // type this dashboard does not render specially.
      connect: () => {
        ensureSubscribed('ADMIN', profile?.id);
        scheduleRefetch();
      },
    });
  }, [scheduleRefetch, toast, profile?.id]);

  /**
   * Safety net.
   *
   * Socket.IO only delivers what happens while you are connected. If the laptop
   * sleeps, the Wi-Fi blips, or a subscribe is lost mid-handshake, the dashboard
   * would otherwise sit on stale numbers with no way to notice. A slow poll
   * guarantees it converges on the truth within 20 seconds no matter what the
   * socket did, and it is cheap because the payload is small and local.
   */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll({ silent: true });
    }, 20000);

    // Coming back to the tab should feel instant, not wait for the next tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadAll({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadAll]);

  async function runReset() {
    setResetting(true);
    try {
      const res = await adminApi.reset();
      toast.success(res.message);
      setResetOpen(false);
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  }

  const stats = snapshot?.stats;
  const payouts = (snapshot?.payouts ?? []).filter((p) => p.amount > 0);

  return (
    <div className="min-h-[100dvh] bg-ink-950">
      <div className="pointer-events-none fixed inset-0 bg-admin-shell" />

      <div className="relative flex min-h-[100dvh]">
        {/* ============ Sidebar ============ */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-white/8 bg-ink-900/95 backdrop-blur-xl
                      transition-transform duration-300 lg:static lg:translate-x-0 lg:bg-ink-900/40
                      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-white/8 px-5 py-5">
              <div className="flex items-center gap-2.5">
                <UniPayMark size={34} />
                <div>
                  <p className="text-base font-black tracking-[.16em] text-white">UNIPAY</p>
                  <p className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">Control Centre</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 space-y-1 p-3">
              {SECTIONS.map(([key, label, path]) => {
                const active = section === key;
                const badge = key === 'payouts' && payouts.length ? payouts.length : null;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSection(key);
                      setSidebarOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-bold transition ${
                      active ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={path} />
                    </svg>
                    <span className="flex-1">{label}</span>
                    {badge && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? 'bg-white/20' : 'bg-gold-500/20 text-gold-400'}`}>
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="space-y-2 border-t border-white/8 p-3">
              <button type="button" onClick={() => setResetOpen(true)} className="btn-ghost w-full !justify-start !text-[12px]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
                </svg>
                Reset demo
              </button>
              <button type="button" onClick={() => signOut()} className="btn-ghost w-full !justify-start !text-[12px]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                Sign out
              </button>
              <p className="px-1 pt-1 text-[10px] leading-relaxed text-slate-600">
                Signed in as <span className="font-semibold text-slate-500">{profile.email}</span>
              </p>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-ink-950/70 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
        )}

        {/* ============ Main ============ */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-white/8 bg-ink-950/85 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 py-3.5 lg:px-7">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white/8 lg:hidden"
                aria-label="Open navigation"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-black tracking-tight text-white lg:text-lg">
                  University Payment Control Centre
                </h1>
                <p className="hidden text-[11px] text-slate-500 sm:block">
                  {snapshot ? `${stats.totalStudents} students · ${stats.totalMerchants} merchants · ${snapshot.liveConnections} live devices` : 'Loading…'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <LiveDot connected={connected} />
                <DemoModeBadge className="hidden sm:inline-flex" />
                <button
                  type="button"
                  onClick={() => loadAll()}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-white/8 hover:text-white"
                  aria-label="Refresh"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 lg:px-7 lg:py-6">
            {loading && !snapshot ? (
              <LoadingState />
            ) : (
              <>
                {section === 'overview' && (
                  <Overview
                    stats={stats}
                    snapshot={snapshot}
                    freshEventIds={freshEventIds}
                    freshTxnIds={freshTxnIds}
                    onGotoPayouts={() => setSection('payouts')}
                  />
                )}
                {section === 'payouts' && (
                  <Payouts
                    payouts={payouts}
                    settlements={snapshot?.recentSettlements ?? []}
                    totalPending={stats?.pendingPayout ?? 0}
                    onPay={setActivePayout}
                  />
                )}
                {section === 'students' && <StudentsTable students={students} />}
                {section === 'merchants' && <MerchantsTable merchants={merchants} onPay={(m) => {
                  const payout = payouts.find((p) => p.merchantId === m.id);
                  if (payout) setActivePayout(payout);
                }} />}
                {section === 'transactions' && <TransactionsTable transactions={transactions} freshIds={freshTxnIds} />}
              </>
            )}
          </main>
        </div>
      </div>

      <SettlementModal
        payout={activePayout}
        open={Boolean(activePayout)}
        onClose={() => setActivePayout(null)}
        onSettled={() => loadAll({ silent: true })}
      />

      {/* --- Reset confirmation --- */}
      <Modal open={resetOpen} onClose={() => !resetting && setResetOpen(false)} title="Reset demo data" size="sm" dismissable={!resetting}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">
            This wipes every wallet, transaction and settlement and rebuilds the original demo dataset.
          </p>
          <ul className="space-y-1.5 rounded-xl border border-white/10 bg-ink-850 p-4 text-[12px] text-slate-400">
            {[
              "Devansh's wallet returns to ₹1,000.00",
              'Canteen Shop #1 receivable returns to ₹0',
              'Seeded students, merchants and history are restored',
              'Accounts created during the demo are removed',
              'Everyone is signed out and must log in again',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                {line}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </button>
            <button type="button" className="btn-danger flex-1" onClick={runReset} disabled={resetting}>
              {resetting ? <Spinner /> : 'Reset demo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ========================= Overview ========================= */

function Overview({ stats, snapshot, freshEventIds, freshTxnIds, onGotoPayouts }) {
  const cards = [
    { label: 'Total students', value: stats.totalStudents.toLocaleString('en-IN'), sub: `${stats.activeStudents} active`, tone: 'brand' },
    { label: 'Total wallet balance', value: formatCompactINR(stats.totalWalletBalance), sub: 'held across all wallets', tone: 'mint' },
    { label: "Today's payments", value: formatCompactINR(stats.todaysPaymentVolume), sub: `${stats.todaysPaymentCount} transactions`, tone: 'brand' },
    { label: 'Merchants', value: String(stats.totalMerchants), sub: `${stats.merchantsAwaitingPayout} awaiting payout`, tone: 'slate' },
    { label: 'Pending merchant payout', value: formatCompactINR(stats.pendingPayout), sub: `${stats.pendingPayoutCount} transactions`, tone: 'gold', action: onGotoPayouts },
  ];

  return (
    <div className="space-y-5">
      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card, i) => (
          <StatCard key={card.label} {...card} delay={i * 50} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Charts */}
        <div className="space-y-4 xl:col-span-2">
          <section className="card p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-white">Transaction volume</h2>
                <p className="text-[11px] text-slate-500">Last 7 days · payments vs wallet top-ups</p>
              </div>
              <p className="shrink-0 text-right text-[11px] font-bold tnum text-slate-400">
                {formatINR(stats.lifetimeVolume, { decimals: 0 })} lifetime
              </p>
            </div>
            <VolumeChart data={snapshot.charts.volumeByDay} />
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="card p-5">
              <h2 className="text-sm font-black text-white">Today by hour</h2>
              <p className="mb-4 text-[11px] text-slate-500">Campus payment rhythm</p>
              <HourlyChart data={snapshot.charts.hourlyToday} />
            </section>

            <section className="card p-5">
              <h2 className="text-sm font-black text-white">Top merchants</h2>
              <p className="mb-4 text-[11px] text-slate-500">By lifetime volume</p>
              <TopMerchantsChart data={snapshot.charts.topMerchants.slice(0, 4)} />
            </section>
          </div>

          {/* Recent transactions */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-sm font-black text-white">Recent transactions</h2>
              <span className="badge-slate">{stats.totalTransactions} total</span>
            </div>
            <TransactionRows transactions={snapshot.recentTransactions.slice(0, 8)} freshIds={freshTxnIds} />
          </section>
        </div>

        {/* Live activity */}
        <section className="card flex max-h-[760px] flex-col overflow-hidden xl:sticky xl:top-[86px]">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <h2 className="text-sm font-black text-white">Live activity</h2>
              <p className="text-[11px] text-slate-500">Real-time across all devices</p>
            </div>
            <LiveDot />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LiveActivityFeed events={snapshot.activity} freshIds={freshEventIds} />
          </div>
          <div className="border-t border-white/8 px-5 py-3">
            <SimulatedTag label="All events simulated" />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, tone, delay = 0, action }) {
  const tones = {
    brand: 'from-brand-500/12 to-transparent ring-brand-500/20 text-brand-300',
    mint: 'from-mint-500/12 to-transparent ring-mint-500/20 text-mint-300',
    gold: 'from-gold-500/12 to-transparent ring-gold-500/25 text-gold-400',
    slate: 'from-white/[0.05] to-transparent ring-white/10 text-slate-300',
  };

  return (
    <div
      onClick={action}
      className={`rounded-2xl bg-gradient-to-br p-4 ring-1 ring-inset animate-fade-up ${tones[tone]} ${
        action ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-lift' : ''
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] font-black uppercase tracking-[.13em] opacity-80">{label}</p>
      <p className="mt-2 text-[26px] font-black leading-none tnum text-white">{value}</p>
      <p className="mt-1.5 text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

/* ========================= To Be Paid ========================= */

function Payouts({ payouts, settlements, totalPending, onPay }) {
  return (
    <div className="space-y-5">
      <div className="card border-gold-500/25 bg-gradient-to-br from-gold-500/[0.08] to-transparent p-5 animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-gold-400">Total to be paid</p>
            <p className="mt-1.5 text-4xl font-black tnum text-white">{formatINR(totalPending, { decimals: 0 })}</p>
            <p className="mt-1 text-[12px] text-slate-400">
              across {payouts.length} merchant{payouts.length === 1 ? '' : 's'}
            </p>
          </div>
          <SimulatedTag label="Simulated bank transfers" />
        </div>
      </div>

      <section className="card overflow-hidden animate-fade-up" style={{ animationDelay: '60ms' }}>
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <h2 className="text-sm font-black text-white">To be paid</h2>
          <span className="badge-gold">{payouts.length} pending</span>
        </div>

        {payouts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-mint-500/15 text-mint-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-200">All merchants settled</p>
            <p className="text-[11px] text-slate-500">Nothing is owed right now.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-white/8 text-left">
                  {['Merchant', 'Amount to be paid', 'Transactions', 'Oldest', 'Status', ''].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {payouts.map((p) => (
                  <tr key={p.merchantId} className="transition hover:bg-white/[0.025]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${avatarColor(p.merchantId)}`}>
                          <span className="text-[10px] font-black">{initials(p.shopName)}</span>
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-white">{p.shopName}</p>
                          <p className="truncate text-[10px] text-slate-500">
                            {p.ownerName} · <span className="font-mono">{p.merchantId}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[15px] font-black tnum text-gold-400">
                      {formatINR(p.amount, { decimals: 0 })}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] tnum text-slate-300">{p.transactionCount}</td>
                    <td className="px-5 py-3.5 text-[11px] text-slate-500">
                      {p.oldestPendingAt ? relativeTime(p.oldestPendingAt) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="badge-gold">Pending</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button type="button" className="btn-primary !min-h-0 !px-4 !py-2 !text-[12px]" onClick={() => onPay(p)}>
                        Pay now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="border-b border-white/8 px-5 py-4">
          <h2 className="text-sm font-black text-white">Settlement history</h2>
          <p className="text-[11px] text-slate-500">Completed simulated payouts</p>
        </div>
        {settlements.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12px] text-slate-500">No settlements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-white/8 text-left">
                  {['Settlement', 'Merchant', 'Amount', 'Transactions', 'Reference', 'Completed'].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {settlements.map((s) => (
                  <tr key={s.id} className="transition hover:bg-white/[0.025]">
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-400">{s.id}</td>
                    <td className="px-5 py-3 text-[13px] font-bold text-white">{s.merchantName}</td>
                    <td className="px-5 py-3 text-[13px] font-black tnum text-mint-400">{formatINR(s.amount, { decimals: 0 })}</td>
                    <td className="px-5 py-3 text-[13px] tnum text-slate-300">{s.transactionCount}</td>
                    <td className="px-5 py-3 font-mono text-[10px] text-slate-500">{s.reference}</td>
                    <td className="px-5 py-3 text-[11px] text-slate-500">{relativeTime(s.completedAt ?? s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ========================= Tables ========================= */

function StudentsTable({ students }) {
  const [query, setQuery] = useState('');
  const filtered = students.filter(
    (s) =>
      !query ||
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.id.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section className="card overflow-hidden animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <h2 className="text-sm font-black text-white">Students</h2>
          <p className="text-[11px] text-slate-500">{students.length} enrolled wallets</p>
        </div>
        <input
          className="field !min-h-0 !w-auto !py-2 !text-[12px] sm:!w-56"
          placeholder="Search name or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {['Student ID', 'Name', 'Wallet balance', 'Spent', 'Status', 'Last transaction'].map((h) => (
                <th key={h} className="px-5 py-2.5 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {filtered.map((s) => (
              <tr key={s.id} className="transition hover:bg-white/[0.025]">
                <td className="px-5 py-3 font-mono text-[12px] font-bold text-brand-300">{s.id}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${avatarColor(s.id)}`}>
                      <span className="text-[9px] font-black">{initials(s.name)}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-white">{s.name}</p>
                      <p className="truncate text-[10px] text-slate-500">{s.course}{s.year ? ` · Year ${s.year}` : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-[14px] font-black tnum text-white">{formatINR(s.walletBalance, { decimals: 0 })}</td>
                <td className="px-5 py-3 text-[12px] tnum text-slate-400">{formatINR(s.totalSpent, { decimals: 0 })}</td>
                <td className="px-5 py-3">
                  <span className={s.status === 'ACTIVE' ? 'badge-mint' : 'badge-danger'}>{s.status}</span>
                </td>
                <td className="px-5 py-3">
                  <p className="text-[12px] text-slate-300">{s.lastTransactionLabel}</p>
                  <p className="text-[10px] text-slate-500">{s.lastTransactionAt ? relativeTime(s.lastTransactionAt) : '—'}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-5 py-10 text-center text-[12px] text-slate-500">No students match "{query}".</p>}
      </div>
    </section>
  );
}

function MerchantsTable({ merchants, onPay }) {
  return (
    <section className="card overflow-hidden animate-fade-up">
      <div className="border-b border-white/8 px-5 py-4">
        <h2 className="text-sm font-black text-white">Merchants</h2>
        <p className="text-[11px] text-slate-500">{merchants.length} campus vendors</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-white/8 text-left">
              {['Merchant', "Today's sales", 'Pending receivable', 'Lifetime volume', 'Payouts', 'Status', ''].map((h) => (
                <th key={h} className="px-5 py-2.5 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {merchants.map((m) => (
              <tr key={m.id} className="transition hover:bg-white/[0.025]">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${avatarColor(m.id)}`}>
                      <span className="text-[10px] font-black">{initials(m.shopName)}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-white">{m.shopName}</p>
                      <p className="truncate text-[10px] text-slate-500">{m.category} · {m.location || m.id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <p className="text-[13px] font-black tnum text-white">{formatINR(m.todaysSales, { decimals: 0 })}</p>
                  <p className="text-[10px] text-slate-500">{m.todaysCount} today</p>
                </td>
                <td className={`px-5 py-3 text-[13px] font-black tnum ${m.pendingReceivable > 0 ? 'text-gold-400' : 'text-slate-600'}`}>
                  {formatINR(m.pendingReceivable, { decimals: 0 })}
                </td>
                <td className="px-5 py-3 text-[12px] tnum text-slate-400">{formatINR(m.lifetimeVolume, { decimals: 0 })}</td>
                <td className="px-5 py-3 text-[12px] tnum text-slate-400">{m.settlementCount}</td>
                <td className="px-5 py-3">
                  <span className={m.pendingReceivable > 0 ? 'badge-gold' : 'badge-mint'}>
                    {m.pendingReceivable > 0 ? 'Awaiting payout' : 'Settled'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {m.pendingReceivable > 0 && (
                    <button type="button" className="btn-ghost !min-h-0 !px-3 !py-1.5 !text-[11px]" onClick={() => onPay(m)}>
                      Pay now
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TransactionsTable({ transactions, freshIds }) {
  return (
    <section className="card overflow-hidden animate-fade-up">
      <div className="border-b border-white/8 px-5 py-4">
        <h2 className="text-sm font-black text-white">Transactions</h2>
        <p className="text-[11px] text-slate-500">Most recent {transactions.length} campus payments</p>
      </div>
      <TransactionRows transactions={transactions} freshIds={freshIds} />
    </section>
  );
}

function TransactionRows({ transactions, freshIds = new Set() }) {
  if (!transactions.length) {
    return <p className="px-5 py-10 text-center text-[12px] text-slate-500">No transactions yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="border-b border-white/8 text-left">
            {['Transaction ID', 'Student', 'Merchant', 'Amount', 'Time', 'Settlement'].map((h) => (
              <th key={h} className="px-5 py-2.5 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {transactions.map((t) => (
            <tr key={t.id} className={`transition hover:bg-white/[0.025] ${freshIds.has(t.id) ? 'animate-flash-row' : ''}`}>
              <td className="px-5 py-3">
                <p className="font-mono text-[11px] font-bold text-slate-300">{t.id}</p>
                {t.source === 'OFFLINE_SYNC' && (
                  <p className="text-[9px] font-black uppercase tracking-wider text-gold-400">offline sync</p>
                )}
              </td>
              <td className="px-5 py-3">
                <p className="text-[13px] font-bold text-white">{t.studentName}</p>
                <p className="font-mono text-[10px] text-slate-500">{t.studentId}</p>
              </td>
              <td className="px-5 py-3">
                <p className="text-[13px] font-semibold text-slate-200">{t.merchantName}</p>
                {t.note && <p className="truncate text-[10px] text-slate-500">{t.note}</p>}
              </td>
              <td className="px-5 py-3 text-[14px] font-black tnum text-white">{formatINR(t.amount, { decimals: 0 })}</td>
              <td className="px-5 py-3">
                <p className="text-[12px] text-slate-300">{relativeTime(t.createdAt)}</p>
              </td>
              <td className="px-5 py-3">
                <span className={t.settlementStatus === 'SETTLED' ? 'badge-mint' : 'badge-gold'}>
                  {t.settlementStatus === 'SETTLED' ? 'Settled' : 'Pending'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="skeleton h-72 xl:col-span-2" />
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}
