"use client";

/**
 * Checking over time, drawn once across everything loaded (about six months back through the end
 * of next month) and shown 60 days at a time. "‹ Earlier", "Now" and "Later ›" slide the strip:
 * what actually happened before today (solid, dark), the forecast made a week before each of those
 * days (dotted), then both cases ahead (best solid, worst dashed).
 */

import { useState } from "react";

export interface SlidePoint {
  date: string;
  cents: number;
}
export interface SlideStep extends SlidePoint {
  pay: boolean;
  label: string;
  amount: number;
}

const DAY = 86_400_000;
const WINDOW = 60;
const UNIT = 20; // viewBox units per day: 60 days = 1200, the same scale as before
const H = 290, T = 14, B = 28, AXIS = 62;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function niceStep(span: number) {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  return ([1, 2, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
}

export function SlidingChart({
  first,
  today,
  until,
  startCents,
  past,
  then,
  best,
  worst,
  mode,
}: {
  /** The first day loaded. */
  first: string;
  today: string;
  until: string;
  startCents: number;
  /** Closing balance each day before today. */
  past: SlidePoint[];
  /** The forecast made a week before, for past days (in the chosen case). */
  then: SlidePoint[];
  best: SlideStep[];
  worst: SlideStep[];
  mode: "worst" | "best";
}) {
  const total = Math.max(WINDOW, Math.round((at(until) - at(first)) / DAY) + 1);
  const nowStart = Math.max(0, Math.min(total - WINDOW, Math.round((at(today) - at(first)) / DAY) - 14));
  const [start, setStart] = useState(nowStart);
  const W = total * UNIT;
  const x = (d: string) => ((at(d) - at(first)) / DAY) * UNIT;
  const all = [...past.map((p) => p.cents), ...then.map((p) => p.cents), startCents, ...best.map((s) => s.cents), ...worst.map((s) => s.cents)];
  const step = niceStep((Math.max(0, ...all) - Math.min(0, ...all)) / 100) * 100;
  const hi = Math.ceil(Math.max(0, ...all) / step) * step || step;
  const lo = Math.floor(Math.min(0, ...all) / step) * step;
  const y = (c: number) => T + ((hi - c) / Math.max(1, hi - lo)) * (H - T - B);
  const grid: number[] = [];
  for (let v = lo; v <= hi; v += step) grid.push(v);

  const stepPath = (steps: SlideStep[]) => {
    let d = `M${x(today)} ${y(startCents)}`;
    for (const s of steps) d += `H${x(s.date)}V${y(s.cents)}`;
    return `${d}H${x(until) + UNIT}`;
  };
  const pastPath = past.length ? past.reduce((d, p, i) => `${d}${i ? `H${x(p.date)}` : ""}V${y(p.cents)}`, `M${x(past[0].date)} ${y(past[0].cents)}`) + `H${x(today)}` : "";
  const thenPath = then.length ? then.map((p, i) => `${i ? "L" : "M"}${x(p.date) + UNIT / 2} ${y(p.cents)}`).join("") : "";
  const sel = mode === "worst" ? worst : best;
  const low = sel.reduce((l, s) => (s.cents < l.cents ? s : l), { date: today, cents: startCents } as SlidePoint);
  const pastLow = past.length ? past.reduce((l, p) => (p.cents < l.cents ? p : l)) : null;
  const weeks: string[] = [];
  for (let t = at(first); t <= at(until); t += 7 * DAY) weeks.push(iso(t));

  const button = (label: string, to: number, disabled: boolean) => (
    <button type="button" disabled={disabled} onClick={() => setStart(to)} className="rounded-lg px-2 py-1 text-accent-text hover:bg-neutral-soft disabled:cursor-default disabled:text-muted/40 disabled:hover:bg-transparent">
      {label}
    </button>
  );
  const shown = `${day(iso(at(first) + start * DAY))} – ${day(iso(at(first) + (start + WINDOW - 1) * DAY))}`;

  return (
    <div>
      <div className="relative mt-2 overflow-hidden" style={{ paddingLeft: `${(AXIS / (1200 + AXIS)) * 100}%` }}>
        {/* The dollar axis stays put while the strip slides under it. */}
        <svg viewBox={`0 0 ${AXIS} ${H}`} className="absolute left-0 top-0 z-10 bg-surface" style={{ width: `${(AXIS / (1200 + AXIS)) * 100}%` }} aria-hidden>
          {grid.map((v) => (
            <text key={v} x={AXIS - 8} y={y(v) + 4} fontSize="12" textAnchor="end" className="fill-muted">
              {money(v)}
            </text>
          ))}
        </svg>
        <div className="overflow-hidden">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${(total / WINDOW) * 100}%`, transform: `translateX(-${(start / total) * 100}%)` }}
            role="img"
            aria-label={`Checking, ${shown}`}
          >
            {grid.map((v) => (
              <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={v === 0 ? "4 4" : undefined} />
            ))}
            <line x1={x(today)} x2={x(today)} y1={T} y2={H - B} stroke="var(--foreground)" strokeOpacity="0.35" />
            <text x={x(today) + 4} y={T + 10} fontSize="11" className="fill-muted">
              Today
            </text>
            {thenPath ? <path d={thenPath} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="2 4" /> : null}
            {pastPath ? <path d={pastPath} fill="none" stroke="var(--foreground)" strokeWidth="2.5" /> : null}
            <path d={`${stepPath(best)}V${y(Math.max(lo, 0))}H${x(today)}Z`} fill="var(--series-1)" fillOpacity="0.08" />
            <path d={stepPath(best)} fill="none" stroke="var(--series-1)" strokeWidth={mode === "best" ? 3 : 2} />
            <path d={stepPath(worst)} fill="none" stroke="var(--series-2)" strokeWidth={mode === "worst" ? 2.5 : 1.75} strokeDasharray="7 5" />
            {sel
              .filter((s) => s.pay)
              .map((s, i) => (
                <circle key={`${s.date}:${i}`} cx={x(s.date)} cy={y(s.cents)} r="4.5" fill="var(--ok)">
                  <title>{`${s.label} ${day(s.date)}: +${money(s.amount)}`}</title>
                </circle>
              ))}
            {past.map((p) => (
              <rect key={p.date} x={x(p.date)} y={T} width={UNIT} height={H - T - B} fill="transparent">
                <title>{`${day(p.date)}: ${money(p.cents)} actual`}</title>
              </rect>
            ))}
            {pastLow ? (
              <g>
                <circle cx={x(pastLow.date)} cy={y(pastLow.cents)} r="4.5" fill={pastLow.cents < 0 ? "var(--danger)" : "var(--foreground)"} />
                <text x={x(pastLow.date) + 8} y={Math.min(H - B - 6, y(pastLow.cents) + 16)} fontSize="12" className="fill-muted">
                  Actual low {money(pastLow.cents)} · {day(pastLow.date)}
                </text>
              </g>
            ) : null}
            <circle cx={x(low.date)} cy={y(low.cents)} r="5.5" fill={low.cents < 0 ? "var(--danger)" : "var(--foreground)"} stroke="var(--surface)" strokeWidth="2" />
            <text x={x(low.date) + 10} y={Math.min(H - B - 6, y(low.cents) + 18)} fontSize="13" fontWeight="700" className={low.cents < 0 ? "fill-danger" : "fill-foreground"}>
              Lowest ahead {money(low.cents)} · {day(low.date)}
            </text>
            {weeks.map((w) => (
              <text key={w} x={x(w)} y={H - 8} fontSize="12" textAnchor="middle" className="fill-muted">
                {day(w)}
              </text>
            ))}
          </svg>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex flex-wrap items-center gap-3 text-muted">
          {past.length ? (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 bg-foreground" />
              Actual
            </span>
          ) : null}
          {then.length ? (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-4 border-t-2 border-dotted border-muted" />
              Forecast a week before
            </span>
          ) : null}
          <span className="tnum">{shown}</span>
        </span>
        <span className="flex items-center gap-1 font-semibold">
          {button("‹ Earlier", Math.max(0, start - 30), start === 0)}
          {button("Now", nowStart, start === nowStart)}
          {button("Later ›", Math.min(total - WINDOW, start + 30), start >= total - WINDOW)}
        </span>
      </div>
    </div>
  );
}
