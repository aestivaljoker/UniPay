import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DemoModeBadge, UniPayMark } from '../components/Brand.jsx';
import { API_BASE, health } from '../services/api.js';

const ROLES = [
  {
    to: '/student/login',
    eyebrow: 'Device 1 · Student phone',
    title: 'Student',
    blurb: 'Wallet balance, ID QR code and simulated top-ups.',
    accent: 'from-brand-500/20 to-brand-500/5 ring-brand-400/25 group-hover:ring-brand-400/60',
    icon: (
      <>
        <path d="M12 3 2 8l10 5 10-5-10-5Z" />
        <path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5" />
      </>
    ),
  },
  {
    to: '/merchant/login',
    eyebrow: 'Device 2 · Shopkeeper phone',
    title: 'Merchant',
    blurb: 'Scan a student QR, charge them, track receivables.',
    accent: 'from-mint-500/20 to-mint-500/5 ring-mint-400/25 group-hover:ring-mint-400/60',
    icon: (
      <>
        <path d="M3 9h18l-1.4 9.3a2 2 0 0 1-2 1.7H6.4a2 2 0 0 1-2-1.7L3 9Z" />
        <path d="M8 9V6a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  {
    to: '/admin/login',
    eyebrow: 'Device 3 · Laptop',
    title: 'University Admin',
    blurb: 'Live command centre, analytics and merchant payouts.',
    accent: 'from-gold-500/20 to-gold-500/5 ring-gold-400/25 group-hover:ring-gold-400/60',
    icon: (
      <>
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M2 20h20M9.5 17h5" />
      </>
    ),
  },
];

export default function Landing() {
  const [server, setServer] = useState({ state: 'checking' });

  // Checking the server here saves a lot of demo-day confusion: if the phone
  // cannot reach the laptop, you find out on the first screen rather than after
  // typing a password.
  useEffect(() => {
    let cancelled = false;
    health()
      .then(() => !cancelled && setServer({ state: 'online' }))
      .catch(() => !cancelled && setServer({ state: 'offline' }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-ink-950">
      <div className="pointer-events-none absolute inset-0 bg-admin-shell" />
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UniPayMark size={40} />
            <div>
              <p className="text-xl font-black tracking-[.2em] text-white">UNIPAY</p>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Closed-loop campus wallet</p>
            </div>
          </div>
          <DemoModeBadge />
        </header>

        <main className="flex flex-1 flex-col justify-center py-12">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[.24em] text-mint-400 animate-fade-up">
            Your Campus. Your Wallet. One Tap.
          </p>
          <h1
            className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-white animate-fade-up sm:text-6xl"
            style={{ animationDelay: '60ms' }}
          >
            Skip the canteen queue.
            <span className="block bg-gradient-to-r from-brand-300 via-brand-200 to-mint-300 bg-clip-text text-transparent">
              Pay with your student ID.
            </span>
          </h1>
          <p
            className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-400 animate-fade-up"
            style={{ animationDelay: '120ms' }}
          >
            A prepaid campus wallet that settles on the university's own network — so a weak mobile signal at the
            counter never blocks a ₹40 samosa. Load once, then pay by QR in one tap.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {ROLES.map((role, i) => (
              <Link
                key={role.to}
                to={role.to}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${role.accent}
                            p-5 ring-1 ring-inset transition-all duration-200 animate-fade-up
                            hover:-translate-y-1 hover:shadow-lift`}
                style={{ animationDelay: `${180 + i * 70}ms` }}
              >
                <p className="text-[9px] font-black uppercase tracking-[.16em] text-slate-500">{role.eyebrow}</p>
                <svg
                  viewBox="0 0 24 24"
                  className="mt-4 h-8 w-8 text-white/90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {role.icon}
                </svg>
                <h2 className="mt-4 text-lg font-extrabold text-white">{role.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{role.blurb}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white/80 transition group-hover:gap-2.5">
                  Open
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </main>

        <footer className="border-t border-white/8 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={`h-2 w-2 rounded-full ${
                  server.state === 'online' ? 'bg-mint-400' : server.state === 'offline' ? 'bg-danger-500' : 'bg-slate-600'
                }`}
              />
              <span className="font-bold text-slate-400">
                {server.state === 'online'
                  ? 'Campus server reachable'
                  : server.state === 'offline'
                    ? 'Central server unavailable'
                    : 'Checking server…'}
              </span>
              <span className="font-mono text-slate-600">{API_BASE || 'same origin'}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Prototype · all payments <span className="font-bold text-gold-400">simulated</span> · no real money moves
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
