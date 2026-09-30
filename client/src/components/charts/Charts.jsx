import { useMemo, useState } from 'react';
import { formatCompactINR, formatINR } from '../../utils/format.js';

/**
 * Hand-rolled inline SVG charts.
 *
 * No charting library: two charts do not justify 100KB+ of bundle on a phone,
 * and inline SVG lets the axis/gridline colours come straight from the palette
 * so they match the rest of the dashboard exactly.
 */

/** Grouped bars: payments vs top-ups over the last 7 days. */
export function VolumeChart({ data = [] }) {
  const [hover, setHover] = useState(null);

  const max = useMemo(() => {
    const peak = Math.max(...data.flatMap((d) => [d.payments, d.topups]), 1);
    // Round the ceiling up so the gridlines land on readable numbers.
    const magnitude = 10 ** Math.floor(Math.log10(peak));
    return Math.ceil(peak / magnitude) * magnitude;
  }, [data]);

  if (!data.length) return <EmptyChart label="No transaction history yet" />;

  const W = 560;
  const H = 200;
  const padL = 46;
  const padB = 26;
  const padT = 10;
  const chartW = W - padL - 8;
  const chartH = H - padB - padT;
  const slot = chartW / data.length;
  const barW = Math.min(14, slot * 0.28);

  const y = (value) => padT + chartH - (value / max) * chartH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Payment volume over the last seven days">
        {/* Gridlines + y-axis */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(max * t)} y2={y(max * t)} stroke="rgba(255,255,255,.07)" strokeWidth="1" />
            <text x={padL - 8} y={y(max * t) + 3.5} textAnchor="end" className="fill-slate-500" fontSize="9" fontWeight="600">
              {formatCompactINR(max * t).replace('₹', '')}
            </text>
          </g>
        ))}

        {data.map((day, i) => {
          const cx = padL + slot * i + slot / 2;
          const active = hover === i;
          return (
            <g key={day.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Generous invisible hit area — bars themselves are thin. */}
              <rect x={padL + slot * i} y={padT} width={slot} height={chartH} fill={active ? 'rgba(255,255,255,.04)' : 'transparent'} />

              <rect
                x={cx - barW - 2}
                y={y(day.payments)}
                width={barW}
                height={Math.max(chartH - (y(day.payments) - padT), 2)}
                rx="3"
                fill="#4B5FE8"
                opacity={hover === null || active ? 1 : 0.45}
              />
              <rect
                x={cx + 2}
                y={y(day.topups)}
                width={barW}
                height={Math.max(chartH - (y(day.topups) - padT), 2)}
                rx="3"
                fill="#12C98A"
                opacity={hover === null || active ? 1 : 0.45}
              />

              <text x={cx} y={H - 8} textAnchor="middle" className={active ? 'fill-white' : 'fill-slate-500'} fontSize="9.5" fontWeight="700">
                {day.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Legend color="#4B5FE8" label="Payments" />
          <Legend color="#12C98A" label="Top-ups" />
        </div>
        {hover !== null && (
          <p className="text-[11px] font-bold tnum text-slate-300">
            {data[hover].label} · {formatINR(data[hover].payments, { decimals: 0 })} in {data[hover].paymentCount} payments
          </p>
        )}
      </div>
    </div>
  );
}

/** Horizontal ranking of merchants by lifetime volume. */
export function TopMerchantsChart({ data = [] }) {
  if (!data.length) return <EmptyChart label="No merchant activity yet" />;
  const max = Math.max(...data.map((d) => d.volume), 1);

  return (
    <ul className="space-y-3">
      {data.map((m, i) => (
        <li key={m.merchantId}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-center text-[10px] font-black text-slate-600">{i + 1}</span>
              <span className="truncate text-[13px] font-bold text-white">{m.shopName}</span>
            </span>
            <span className="shrink-0 text-[12px] font-black tnum text-slate-300">
              {formatINR(m.volume, { decimals: 0 })}
            </span>
          </div>
          <div className="ml-6 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-all duration-700"
              style={{ width: `${Math.max((m.volume / max) * 100, 2)}%` }}
            />
          </div>
          <p className="ml-6 mt-1 text-[10px] text-slate-500">
            {m.count} payments · {formatINR(m.pendingReceivable, { decimals: 0 })} pending
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Today's activity by campus hour. */
export function HourlyChart({ data = [] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  const hasData = data.some((d) => d.count > 0);

  if (!hasData) return <EmptyChart label="No payments yet today" compact />;

  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]">
        {data.map((bucket) => (
          <div key={bucket.hour} className="group relative flex-1" title={`${bucket.hour}:00 — ${formatINR(bucket.amount, { decimals: 0 })}`}>
            <div
              className={`w-full rounded-t-[3px] transition-all duration-500 ${
                bucket.count ? 'bg-gradient-to-t from-mint-600 to-mint-400' : 'bg-white/[0.05]'
              }`}
              style={{ height: `${Math.max((bucket.amount / max) * 96, bucket.count ? 4 : 2)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] font-bold text-slate-600">
        <span>7 AM</span>
        <span>1 PM</span>
        <span>9 PM</span>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
    </span>
  );
}

function EmptyChart({ label, compact = false }) {
  return (
    <div className={`flex items-center justify-center rounded-xl bg-white/[0.02] ${compact ? 'h-24' : 'h-40'}`}>
      <p className="text-[11px] font-semibold text-slate-600">{label}</p>
    </div>
  );
}
