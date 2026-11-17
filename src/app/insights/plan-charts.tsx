/**
 * The spending plan's pictures: a donut of what's left by kind, the payday
 * plan, and three charts (left to spend through the period, the 0% payoff,
 * money in against money out per period). Plain SVG; colors are theme tokens.
 */

import type { EnvelopesView } from "@/server/envelopes";
import { Card } from "@/components/ui";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** Kind colors, from the theme: steady for essentials, the accent for flexible. */
export const KIND_COLORS = {
  ESSENTIAL: "var(--ok)",
  PLANNED: "var(--info)",
  FLEXIBLE: "var(--accent)",
  OVER: "var(--danger)",
} as const;

const KIND_TEXT = {
  ESSENTIAL: { label: "Essentials", what: "groceries, vehicles, health, school" },
  PLANNED: { label: "Planned", what: "giving, sports" },
  FLEXIBLE: { label: "Flexible", what: "eating out, shopping, fun" },
} as const;

/** What's left to spend, split by kind, with any overage as a red slice. */
export function LeftDonut({ view, until }: { view: EnvelopesView; until: string }) {
  const parts = (["ESSENTIAL", "PLANNED", "FLEXIBLE"] as const).map((k) => ({ key: k, cents: Math.max(0, view.byTier[k].leftCents) }));
  const over = view.allOverCents;
  const slices = [...parts.map((p) => ({ key: p.key as string, cents: p.cents, color: KIND_COLORS[p.key] })), ...(over > 0 ? [{ key: "OVER", cents: over, color: KIND_COLORS.OVER }] : [])];
  const total = slices.reduce((s, x) => s + x.cents, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const left = view.allLeftCents;
  return (
    <Card>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0" role="img" aria-label={`${money(left)} ${left < 0 ? "over" : "left"} ${until}`}>
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--neutral-soft)" strokeWidth="18" />
          {total > 0
            ? slices.map((s) => {
                const len = (s.cents / total) * c;
                const el = (
                  <circle
                    key={s.key}
                    cx="70"
                    cy="70"
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="18"
                    strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 70 70)"
                  />
                );
                offset += len;
                return el;
              })
            : null}
          <text x="70" y="66" textAnchor="middle" className="fill-current font-heading" style={{ fontSize: 20, fontWeight: 700 }}>
            {money(Math.abs(left))}
          </text>
          <text x="70" y="84" textAnchor="middle" className="fill-current" style={{ fontSize: 10, opacity: 0.7 }}>
            {left < 0 ? "over" : "left to spend"}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted">
            {left < 0 ? "Over" : "Left in your spending plan"} {until}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {parts.map((p) => (
              <li key={p.key} className="flex items-baseline gap-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_COLORS[p.key] }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <b>{KIND_TEXT[p.key].label}</b> <span className="text-xs text-muted">{KIND_TEXT[p.key].what}</span>
                </span>
                <b className="tnum">{money(p.cents)}</b>
              </li>
            ))}
            {over > 0 ? (
              <li className="flex items-baseline gap-2 text-danger">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_COLORS.OVER }} aria-hidden />
                <span className="min-w-0 flex-1 font-semibold">Over, nothing left to cover it</span>
                <b className="tnum">{money(over)}</b>
              </li>
            ) : null}
          </ul>
          {left > 0 ? (
            <p className="tnum mt-2 text-xs text-muted">
              About {money(view.perDayCents)} a day for {view.period.daysLeft} more day{view.period.daysLeft === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** What to do with the paycheck: debt payment, bills to hold, each card, and what's left in checking. */
export function PaydayPlanCard({ view }: { view: EnvelopesView }) {
  const p = view.payday;
  if (!p) return null;
  const resultText = { zero: "pays it to zero", statement: "covers the statement", short: "short of the statement", none: "nothing owed" } as const;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold">{p.isPayday ? "Today's payday plan" : "Payday plan"}</h2>
        <span className="tnum text-sm text-muted">{money(p.checkingCents)} in checking</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {p.isPayday ? "What to do with today's paycheck." : `With what's in checking now, until payday ${day(view.period.next)}.`}
      </p>
      <ol className="mt-3 space-y-3 text-sm">
        {p.debtCents > 0 ? (
          <li className="flex justify-between gap-3">
            <span>
              <b>1. Send to {p.debtName ?? "the 0% card"}</b>
              {p.debtDueOn ? <span className="block text-xs text-muted">Due {day(p.debtDueOn)}</span> : null}
            </span>
            <b className="tnum">{money(p.debtCents)}</b>
          </li>
        ) : null}
        <li>
          <span className="flex justify-between gap-3">
            <b>{p.debtCents > 0 ? "2." : "1."} Hold for bills before payday</b>
            <b className="tnum">{money(p.holdCents)}</b>
          </span>
          {p.bills.length ? (
            <span className="mt-1 block text-xs text-muted">{p.bills.map((b) => `${b.name} ${money(b.cents)} (${day(b.dueOn)})`).join(" · ")}</span>
          ) : (
            <span className="mt-1 block text-xs text-muted">Nothing else is due before payday.</span>
          )}
        </li>
        <li>
          <span className="flex justify-between gap-3">
            <b>{p.debtCents > 0 ? "3." : "2."} Send to the cards</b>
            <b className="tnum">{money(p.cards.reduce((t, c) => t + c.sendCents, 0))}</b>
          </span>
          {p.forCardsCents < 0 ? (
            <span className="mt-1 block rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
              Checking is {money(-p.forCardsCents)} short of the bills and debt payment, before any card payment.
            </span>
          ) : null}
          <ul className="mt-1.5 space-y-1">
            {p.cards
              .filter((c) => c.owedCents > 0)
              .map((c) => (
                <li key={c.id} className="flex justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate">
                    {c.name} <span className="text-muted">· due {day(c.dueOn)} · owes {money(c.owedCents)}</span>
                  </span>
                  <span className={`tnum shrink-0 ${c.result === "short" ? "text-danger" : c.result === "zero" ? "text-ok" : ""}`}>
                    {money(c.sendCents)} {resultText[c.result]}
                  </span>
                </li>
              ))}
          </ul>
        </li>
      </ol>
      <p className="mt-3 flex justify-between gap-3 border-t border-line pt-2 text-sm font-semibold">
        <span>Left in checking until payday</span>
        <span className={`tnum ${p.afterCents < 0 ? "text-danger" : ""}`}>{money(p.afterCents)}</span>
      </p>
      {p.leftOnCardsCents > 0 ? <p className="mt-1 text-xs text-muted">{money(p.leftOnCardsCents)} stays on the cards until the next paycheck.</p> : null}
    </Card>
  );
}

function Frame({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

const W = 320;
const H = 140;
const PAD = { l: 8, r: 8, t: 10, b: 22 };

/** Left to spend each day of the period against an even pace. */
export function LeftPaceChart({ view }: { view: EnvelopesView }) {
  const days = view.daily;
  if (days.length < 2 || view.hadCents <= 0) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  let spent = 0;
  const left = days.map((d) => ({ date: d.date, cents: (spent += d.spentCents, view.hadCents - spent), past: d.date <= today }));
  const min = Math.min(0, ...left.map((x) => x.cents));
  const max = view.hadCents;
  const x = (i: number) => PAD.l + (i / (days.length - 1)) * (W - PAD.l - PAD.r);
  const y = (c: number) => PAD.t + ((max - c) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const shown = left.filter((p) => p.past);
  const line = shown.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" ");
  const last = shown[shown.length - 1];
  const paceNow = last ? view.hadCents * (1 - (shown.length - 1) / (days.length - 1)) : view.hadCents;
  const ahead = last ? last.cents - paceNow : 0;
  return (
    <Frame
      title="Left to spend through the pay period"
      note={last ? (ahead >= 0 ? `${money(ahead)} ahead of an even pace.` : `${money(-ahead)} behind an even pace.`) : "Even pace shown dashed."}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Left to spend each day against an even pace">
        <line x1={x(0)} y1={y(0)} x2={x(days.length - 1)} y2={y(0)} stroke="var(--border)" />
        <line x1={x(0)} y1={y(max)} x2={x(days.length - 1)} y2={y(0)} stroke="var(--muted)" strokeDasharray="4 4" />
        <path d={line} fill="none" stroke={ahead >= 0 ? "var(--accent)" : "var(--danger)"} strokeWidth="2.5" strokeLinejoin="round" />
        {last ? <circle cx={x(shown.length - 1)} cy={y(last.cents)} r="3.5" fill={ahead >= 0 ? "var(--accent)" : "var(--danger)"} /> : null}
        <text x={x(0)} y={H - 6} className="fill-current" style={{ fontSize: 9, opacity: 0.6 }}>
          {day(days[0].date)}
        </text>
        <text x={x(days.length - 1)} y={H - 6} textAnchor="end" className="fill-current" style={{ fontSize: 9, opacity: 0.6 }}>
          {day(days[days.length - 1].date)}
        </text>
      </svg>
    </Frame>
  );
}

/** The 0% balance over time, and where it heads at this payment, against the offer's end. */
export function DebtChart({ view }: { view: EnvelopesView }) {
  const d = view.debtChart;
  const ends = view.debt.endsOn;
  if (!d || !d.points.length) return null;
  const all = [...d.points, ...d.projected];
  const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const t0 = t(all[0].date);
  const lastProjected = d.projected[d.projected.length - 1]?.date ?? all[all.length - 1].date;
  const t1 = Math.max(t(lastProjected), ends ? t(ends) : 0, t0 + 86_400_000);
  const max = Math.max(...all.map((p) => p.cents), 1);
  const x = (iso: string) => PAD.l + ((t(iso) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (c: number) => PAD.t + (1 - c / max) * (H - PAD.t - PAD.b);
  const path = (pts: Array<{ date: string; cents: number }>) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" ");
  const done = view.debt.doneOn;
  const late = !!(ends && done && done > ends);
  return (
    <Frame
      title="Paying off the 0% balance"
      note={
        done
          ? `${money(view.debt.balanceCents ?? 0)} owed. At ${money(view.debt.perPeriodCents)} each payday it's gone ${monthYear(done)}${ends ? (late ? `, after the 0% ends ${monthYear(ends)}` : `, before the 0% ends ${monthYear(ends)}`) : ""}.`
          : "Nothing is going to it yet."
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="The 0% balance over time and where it heads">
        <line x1={PAD.l} y1={y(0)} x2={W - PAD.r} y2={y(0)} stroke="var(--border)" />
        {ends ? (
          <>
            <line x1={x(ends)} y1={PAD.t} x2={x(ends)} y2={y(0)} stroke="var(--warn)" strokeDasharray="3 3" />
            <text x={x(ends) - 3} y={PAD.t + 8} textAnchor="end" className="fill-current" style={{ fontSize: 9, opacity: 0.7 }}>
              0% ends
            </text>
          </>
        ) : null}
        <path d={path(d.projected)} fill="none" stroke={late ? "var(--danger)" : "var(--ok)"} strokeWidth="2" strokeDasharray="5 4" />
        <path d={path(d.points)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        <text x={PAD.l} y={H - 6} className="fill-current" style={{ fontSize: 9, opacity: 0.6 }}>
          {monthYear(all[0].date)}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-current" style={{ fontSize: 9, opacity: 0.6 }}>
          {monthYear(new Date(t1).toISOString().slice(0, 10))}
        </text>
      </svg>
    </Frame>
  );
}

/** Money in against money out, one pair of bars per recent pay period. */
export function HistoryBars({ view }: { view: EnvelopesView }) {
  const rows = view.history.filter((h) => h.inCents || h.outCents);
  if (rows.length < 2) return null;
  const max = Math.max(...rows.flatMap((h) => [h.inCents, h.outCents]), 1);
  const done = rows.filter((h) => !h.current);
  const overCount = done.filter((h) => h.outCents > h.inCents).length;
  const bw = (W - PAD.l - PAD.r) / rows.length;
  const y = (c: number) => PAD.t + (1 - c / max) * (H - PAD.t - PAD.b);
  return (
    <Frame
      title={view.period.byPayday && view.period.view === "period" ? "Each pay period: in and out" : "Each month: in and out"}
      note={done.length ? `Out was more than in for ${overCount} of the last ${done.length}. Gray is money in; colored is money out.` : "Gray is money in; colored is money out."}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Money in against money out per period">
        <line x1={PAD.l} y1={y(0)} x2={W - PAD.r} y2={y(0)} stroke="var(--border)" />
        {rows.map((h, i) => {
          const x0 = PAD.l + i * bw;
          const w = Math.max(2, bw / 2 - 3);
          const over = h.outCents > h.inCents;
          return (
            <g key={h.from} opacity={h.current ? 0.55 : 1}>
              <title>{`${day(h.from)}: in ${money(h.inCents)}, out ${money(h.outCents)}${h.current ? " (so far)" : ""}`}</title>
              <rect x={x0 + 2} y={y(h.inCents)} width={w} height={Math.max(0, y(0) - y(h.inCents))} rx="2" fill="var(--neutral)" opacity="0.45" />
              <rect x={x0 + 2 + w + 2} y={y(h.outCents)} width={w} height={Math.max(0, y(0) - y(h.outCents))} rx="2" fill={over ? "var(--danger)" : "var(--accent)"} />
              <text x={x0 + bw / 2} y={H - 6} textAnchor="middle" className="fill-current" style={{ fontSize: 8, opacity: 0.6 }}>
                {day(h.from)}
              </text>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}
