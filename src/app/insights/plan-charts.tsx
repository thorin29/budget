/**
 * The plan's charts, each answering one question:
 *  - Where does this month's money go? (a donut of money in: bills, debt, essentials, extras, unplanned, left; a red outer ring past it)
 *  - Are we on pace? (what's left in the pool day by day against an even pace)
 *  - Is the 0% balance on track? (its balance against the end of the offer)
 *  - Did each month live within its money? (money in against money out)
 * Plain SVG; hovering a mark shows its numbers.
 */

import type { ReactNode } from "react";
import type { MonthPlanView } from "@/server/month-plan";
import type { BankCheckParts } from "@/server/cash-timing";
import Link from "next/link";
import type { DebtChart, MonthHistory } from "@/server/plan-charts";
import { Card } from "@/components/ui";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthShort = (ym: string, year = false) =>
  new Date(`${ym.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Round axis steps: 1, 2 or 5 times a power of ten, in dollars. */
function ticks(lo: number, hi: number, count = 4): number[] {
  const span = Math.max(1, hi - lo) / 100;
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * p >= raw) ?? 10) * p * 100;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

// ---------------------------------------------------------------- where the money goes

/**
 * Bank check: checking plus the pay still coming this month, against what's already owed: everything
 * on the cards (paid to zero, so it all leaves checking), bills still due from checking and the debt
 * payment. What's left is what checking holds once all of it is paid.
 */
function BankCheck({ check, debtCents, monthLeftCents }: { check: BankCheckParts; debtCents: number; monthLeftCents: number }) {
  const have = check.checkingCents + check.incomeCents;
  const owed = [
    { key: "cards", label: check.cards === 1 ? "Owed on the card" : "Owed on cards", cents: check.cardsCents, color: "var(--muted)", opacity: 0.55 },
    { key: "bills", label: "Bills still due", cents: check.billsCents, color: "var(--series-1)", opacity: 0.35 },
    { key: "debt", label: "Debt payment", cents: debtCents, color: "var(--series-2)", opacity: 0.35 },
  ].filter((o) => o.cents > 0);
  const owedCents = owed.reduce((t, o) => t + o.cents, 0);
  const after = have - owedCents;
  const scale = Math.max(1, have, owedCents);
  const w = (c: number) => `${Math.max(0, (c / scale) * 100)}%`;
  const before = after - monthLeftCents;
  const swatch = (color: string, opacity = 1) => <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color, opacity }} />;
  return (
    <div className="mt-4 rounded-xl bg-neutral-soft px-4 py-3.5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span>
          <b>Checking {money(check.checkingCents)}</b>
          {check.incomeCents > 0 ? <span className="text-muted"> + {money(check.incomeCents)} still coming in</span> : null}
        </span>
        <Link href="/insights/cash" className="text-xs text-accent-text hover:underline">
          Day by day ›
        </Link>
      </div>
      <div className="relative mt-2.5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${money(have)} in checking and still coming in; ${money(owedCents)} already owed; ${after >= 0 ? `${money(after)} left` : `${money(-after)} short`} once it's all paid`}>
        {owed.map((o) => (
          <span key={o.key} className="block h-full" style={{ width: w(o.cents), background: o.color, opacity: o.opacity }} title={`${o.label}: ${money(o.cents)}`} />
        ))}
        {after > 0 ? <span className="block h-full" style={{ width: w(after), background: "var(--ok)" }} title={`After everything's paid: ${money(after)}`} /> : null}
        {check.incomeCents > 0 && have > 0 ? (
          <span aria-hidden className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: w(check.checkingCents) }} title="Where today's balance ends" />
        ) : null}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {owed.map((o) => (
          <li key={o.key} className="flex items-center gap-1.5">
            {swatch(o.color, o.opacity)}
            {o.label} <span className="tnum text-foreground">{money(o.cents)}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-2.5 font-semibold ${after >= 0 ? "text-ok" : "text-danger"}`}>
        {after >= 0 ? `After every card and bill is paid: about ${money(after)}` : `Checking comes up ${money(-after)} short once every card and bill is paid`}
      </p>
      {after >= 0 && monthLeftCents >= 0 && before >= 0 ? (
        <p className="mt-0.5 text-xs text-muted">
          {money(monthLeftCents)} left from this month plus {money(before)} you started the month with.
        </p>
      ) : null}
    </div>
  );
}

/** An open arc on a circle centered at (c, c) from `from` to `to` thousandths of a turn, for use inside rotate(-90). */
function ringArc(c: number, r: number, from: number, to: number) {
  const a = (t: number) => (t / 1000) * 2 * Math.PI;
  const p = (t: number) => `${(c + r * Math.cos(a(t))).toFixed(2)} ${(c + r * Math.sin(a(t))).toFixed(2)}`;
  return `M ${p(from)} A ${r} ${r} 0 ${to - from > 500 ? 1 : 0} 1 ${p(to)}`;
}

/**
 * Income vs expenses: the full circle is the month's expected income. The outer ring fills with
 * income received; the inner ring holds every expense on the same scale, what's already paid or
 * spent first (so it lines up with income received), then bills and the debt payment still due,
 * then what's left. Spending past income grows as a red arc outside the circle. Only actual
 * spending is shown for everyday categories: no budget amounts.
 */
export function IncomeVsExpenses({ plan, check }: { plan: MonthPlanView; check?: BankCheckParts | null }) {
  const by = (t: string) => plan.groups.filter((g) => g.tier === t).reduce((s, g) => s + g.spentCents, 0);
  const billsPaid = plan.bills.paidCents;
  const billsDue = Math.max(0, plan.bills.totalCents - billsPaid);
  const debtPaid = plan.debt.source === "paid" ? plan.debt.cents : 0;
  const debtDue = plan.debt.cents - debtPaid;
  const income = Math.max(0, plan.income.totalCents);
  const received = Math.max(0, plan.income.receivedCents);
  const spent = { ess: by("ESSENTIAL"), ext: by("FLEXIBLE"), unp: by("UNPLANNED") + by("SORT") };
  const segs = [
    { key: "ess", label: "Essentials", cents: spent.ess, color: "var(--series-3)", due: false },
    { key: "ext", label: "Extras", cents: spent.ext, color: "var(--series-4)", due: false },
    { key: "unp", label: "Unplanned", cents: spent.unp, color: "var(--series-5)", due: false },
    { key: "debtPaid", label: "Debt payment", cents: debtPaid, color: "var(--series-2)", due: false },
    { key: "billsPaid", label: "Bills", cents: billsPaid, color: "var(--series-1)", due: false },
    { key: "debtDue", label: "Debt payment", cents: debtDue, color: "var(--series-2)", due: true },
    { key: "billsDue", label: "Bills", cents: billsDue, color: "var(--series-1)", due: true },
  ].filter((g) => g.cents > 0);
  const out = segs.reduce((t, g) => t + g.cents, 0);
  const actual = spent.ess + spent.ext + spent.unp + debtPaid + billsPaid;
  const left = income - out;
  const scale = Math.max(1, income || out);
  const S = 300, C = S / 2, R_IN = 96, W_IN = 30, R_OUT = 127, W_OUT = 14, R_OVER = 144;
  const turn = (c: number) => (c / scale) * 1000;
  let at0 = 0;
  const arcs = segs.map((g) => {
    const from = Math.min(1000, at0);
    const len = Math.max(0, Math.min(1000, at0 + turn(g.cents)) - from - (segs.length > 1 ? 2 : 0));
    at0 += turn(g.cents);
    return { ...g, from, len };
  });
  const tick = Math.min(1, received / scale) * 2 * Math.PI;
  const tx = (r: number) => C + r * Math.sin(tick);
  const ty = (r: number) => C - r * Math.cos(tick);
  const pct = (c: number) => `${Math.min(100, Math.max(0, (c / scale) * 100))}%`;
  const row = (label: string, color: string, value: ReactNode, bar: ReactNode, strong = false) => (
    <li className="space-y-1">
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          <span aria-hidden className={`inline-block h-3 w-3 rounded-sm ${color === "transparent" ? "border-2 border-dashed border-muted" : ""}`} style={{ background: color }} />
          {strong ? <b>{label}</b> : label}
        </span>
        <span className="tnum">{value}</span>
      </span>
      <span className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-soft">{bar}</span>
    </li>
  );
  const fill = (c: number, color: string, opacity = 1) => <span className="block h-full rounded-full" style={{ width: pct(c), background: color, opacity }} />;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Income vs expenses</h2>
        <span className="text-xs text-muted">The full circle is the month&rsquo;s {money(income)} expected income</span>
      </div>
      <div className="@container mt-3"><div className="grid items-center gap-5 @xl:grid-cols-[240px_1fr]">
        <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-64" role="img" aria-label={`Income ${money(received)} of ${money(income)} received; ${money(actual)} paid and spent; ${money(billsDue + debtDue)} still due; ${left >= 0 ? `${money(left)} left to spend` : `${money(-left)} over income`}`}>
          <g transform={`rotate(-90 ${C} ${C})`} fill="none">
            <circle cx={C} cy={C} r={R_OUT} stroke="var(--border)" strokeWidth={W_OUT} pathLength={1000} />
            <circle cx={C} cy={C} r={R_OUT} stroke="var(--foreground)" strokeWidth={W_OUT} pathLength={1000} strokeDasharray={`${turn(received)} 1000`}>
              <title>{`Income received: ${money(received)} of ${money(income)}`}</title>
            </circle>
            {arcs.map((g) => (
              <circle key={g.key} cx={C} cy={C} r={R_IN} stroke={g.color} strokeOpacity={g.due ? 0.3 : 1} strokeWidth={W_IN} pathLength={1000} strokeDasharray={`${g.len} 1000`} strokeDashoffset={-g.from}>
                <title>{`${g.label}${g.due ? " still due" : g.key.endsWith("Paid") ? " paid" : " spent"}: ${money(g.cents)}`}</title>
              </circle>
            ))}
            {left > 0 ? (
              <path d={ringArc(C, R_IN, Math.min(1000, at0) + 2, 1000)} stroke="var(--muted)" strokeWidth={W_IN} strokeDasharray="2 3" opacity={0.6}>
                <title>{`Left to spend: ${money(left)}`}</title>
              </path>
            ) : null}
            {left < 0 ? (
              <circle cx={C} cy={C} r={R_OVER} stroke="var(--danger)" strokeWidth={7} strokeLinecap="round" pathLength={1000} strokeDasharray={`${Math.min(1000, turn(-left))} 1000`}>
                <title>{`Over income: ${money(-left)}`}</title>
              </circle>
            ) : null}
          </g>
          {income > 0 ? <line x1={tx(R_IN - W_IN / 2 - 4)} y1={ty(R_IN - W_IN / 2 - 4)} x2={tx(R_OUT + W_OUT / 2 + 2)} y2={ty(R_OUT + W_OUT / 2 + 2)} stroke="var(--foreground)" strokeWidth="2.5" /> : null}
          <text x={C} y={C - 2} textAnchor="middle" fontSize="28" fontWeight="700" className={left < 0 ? "fill-danger" : "fill-foreground"}>
            {left < 0 ? `${money(-left)} over` : money(left)}
          </text>
          <text x={C} y={C + 20} textAnchor="middle" fontSize="12" className={left < 0 ? "fill-danger" : "fill-muted"}>
            {left < 0 ? "expenses pass income" : "left to spend"}
          </text>
        </svg>
        <ul className="space-y-2.5">
          {row("Income", "var(--foreground)", <><b>{money(received)}</b> <span className="text-xs text-muted">of {money(income)}</span></>, <>{fill(received, "var(--foreground)")}</>, true)}
          {row("Essentials", "var(--series-3)", <b>{money(spent.ess)}</b>, fill(spent.ess, "var(--series-3)"))}
          {row("Extras", "var(--series-4)", <b>{money(spent.ext)}</b>, fill(spent.ext, "var(--series-4)"))}
          {row("Unplanned", "var(--series-5)", <b>{money(spent.unp)}</b>, fill(spent.unp, "var(--series-5)"))}
          {plan.debt.cents > 0
            ? row("Debt payment", "var(--series-2)", <><b>{money(debtPaid)}</b> <span className="text-xs text-muted">paid of {money(plan.debt.cents)}</span></>, <>{fill(debtPaid, "var(--series-2)")}{fill(debtDue, "var(--series-2)", 0.3)}</>)
            : null}
          {row("Bills", "var(--series-1)", <><b>{money(billsPaid)}</b> <span className="text-xs text-muted">paid of {money(plan.bills.totalCents)}</span></>, <>{fill(billsPaid, "var(--series-1)")}{fill(billsDue, "var(--series-1)", 0.3)}</>)}
          <li className="border-t border-line pt-2.5">
            {left >= 0
              ? row("Left to spend", "transparent", <b>{money(left)}</b>, fill(left, "var(--muted)", 0.5), true)
              : row("Over income", "var(--danger)", <b className="text-danger">{money(-left)}</b>, fill(-left, "var(--danger)"), true)}
          </li>
        </ul>
      </div></div>
      {!plan.closed && check ? <BankCheck check={check} debtCents={debtDue} monthLeftCents={left} /> : null}
    </Card>
  );
}

// ---------------------------------------------------------------- pace

export function PaceChart({ plan }: { plan: MonthPlanView }) {
  if (plan.closed) return null;
  const W = 480, H = 220, L = 52, R = 12, T = 12, B = 24;
  const days = plan.daily;
  const n = days.length;
  let spent = 0;
  const today = plan.today;
  const series = days
    .filter((d) => d.date <= today)
    .map((d) => {
      spent += d.spentCents;
      return { date: d.date, left: plan.poolCents - spent };
    });
  const lo = Math.min(0, ...series.map((s) => s.left));
  const hi = Math.max(plan.poolCents, 1);
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (c: number) => T + ((hi - c) / Math.max(1, hi - lo)) * (H - T - B);
  const pace = (i: number) => plan.poolCents * (1 - (i + 1) / n);
  const idx = series.length - 1;
  const now = series[idx];
  const ahead = now ? now.left - pace(idx) : 0;
  const path = series.map((s, i) => `${i ? "L" : "M"}${x(i)} ${y(s.left)}`).join("");
  return (
    <Card>
      <h2 className="text-base font-bold">Are we on pace?</h2>
      <p className="mt-0.5 text-xs text-muted">
        What&rsquo;s left in the pool each day, against spending it evenly through the month.{" "}
        {now ? (
          <b className={ahead < 0 ? "text-danger" : "text-ok"}>
            {ahead < 0 ? `${money(-ahead)} less left than an even pace would leave` : `${money(ahead)} more left than an even pace would leave: on track`}
          </b>
        ) : null}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`Pool left ${now ? money(now.left) : ""} on ${day(today)} against an even pace`}>
        {ticks(lo, hi).map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" className="fill-muted">
              {money(t)}
            </text>
          </g>
        ))}
        <line x1={x(0)} y1={y(plan.poolCents)} x2={x(n - 1)} y2={y(0)} stroke="var(--muted)" strokeDasharray="5 5" strokeWidth="1.5" />
        <text x={x(n - 1) - 4} y={y(0) - 6} textAnchor="end" fontSize="11" className="fill-muted">
          even pace
        </text>
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" />
        {series.map((s, i) => (
          <circle key={s.date} cx={x(i)} cy={y(s.left)} r={i === idx ? 4.5 : 3} fill="var(--series-1)">
            <title>{`${day(s.date)}: ${money(s.left)} left in the pool (even pace ${money(pace(i))})`}</title>
          </circle>
        ))}
        {[0, Math.floor(n / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" className="fill-muted">
            {day(days[i].date)}
          </text>
        ))}
      </svg>
    </Card>
  );
}

// ---------------------------------------------------------------- the 0% balance

export function DebtChartCard({ debt }: { debt: DebtChart }) {
  const W = 480, H = 220, L = 60, R = 12, T = 12, B = 24;
  const start = debt.points[0]?.date ?? debt.projected[0]?.date;
  const endDate = new Date(Date.UTC(Number(debt.endsOn.slice(0, 4)), Number(debt.endsOn.slice(5, 7)) - 1 + 2, 1)).toISOString().slice(0, 10);
  const t0 = at(start), t1 = at(endDate);
  const hi = Math.max(1, ...debt.points.map((p) => p.cents), debt.balanceCents);
  const x = (d: string) => L + ((Math.min(at(d), t1) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (c: number) => T + ((hi - c) / hi) * (H - T - B);
  const line = (pts: Array<{ date: string; cents: number }>) => pts.filter((p) => at(p.date) <= t1).map((p, i) => `${i ? "L" : "M"}${x(p.date)} ${y(p.cents)}`).join("");
  const clears = debt.projected.find((p) => p.cents === 0)?.date ?? null;
  const late = !clears || clears > debt.endsOn;
  const owedAtEnd = debt.projected.filter((p) => p.date <= debt.endsOn).at(-1)?.cents ?? debt.balanceCents;
  return (
    <Card>
      <h2 className="text-base font-bold">Is the 0% balance on track?</h2>
      <p className="mt-0.5 text-xs text-muted">
        {debt.name ? `${debt.name}: ` : ""}
        {money(debt.balanceCents)} owed; the offer ends {day(debt.endsOn)}, {debt.endsOn.slice(0, 4)}.{" "}
        <b className={late ? "text-warn" : "text-ok"}>
          {late
            ? `At ${money(debt.monthlyCents)} a month about ${money(owedAtEnd)} is still owed when it ends${debt.targetCents ? `; ${money(debt.targetCents)} a month clears it` : ""}.`
            : `At ${money(debt.monthlyCents)} a month it clears in ${monthShort(clears!, true)}, before the offer ends.`}
        </b>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`0% balance ${money(debt.balanceCents)}, offer ends ${day(debt.endsOn)}`}>
        {ticks(0, hi).map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" className="fill-muted">
              {money(t)}
            </text>
          </g>
        ))}
        <line x1={x(debt.endsOn)} x2={x(debt.endsOn)} y1={T} y2={H - B} stroke="var(--danger)" strokeDasharray="3 3" />
        <text x={x(debt.endsOn) - 4} y={T + 10} textAnchor="end" fontSize="11" className="fill-danger">
          offer ends
        </text>
        {debt.target.length ? <path d={line(debt.target)} fill="none" stroke="var(--series-3)" strokeWidth="2" strokeDasharray="2 4" /> : null}
        <path d={line(debt.projected)} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeDasharray="6 4" />
        <path d={line(debt.points)} fill="none" stroke="var(--series-1)" strokeWidth="2.5" />
        {debt.points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.cents)} r="2.5" fill="var(--series-1)">
            <title>{`${day(p.date)}: ${money(p.cents)} owed`}</title>
          </circle>
        ))}
        <text x={L} y={H - 6} fontSize="11" className="fill-muted">
          {monthShort(start, true)}
        </text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="11" className="fill-muted">
          {monthShort(endDate, true)}
        </text>
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-5 bg-[var(--series-1)]" />Balance so far</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block w-5 border-t-2 border-dashed border-[var(--series-1)]" />At {money(debt.monthlyCents)} a month</li>
        {debt.targetCents ? <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block w-5 border-t-2 border-dotted border-[var(--series-3)]" />At {money(debt.targetCents)} a month</li> : null}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- months

export function HistoryChart({ rows }: { rows: MonthHistory[] }) {
  if (rows.length < 2) return null;
  const W = 960, H = 250, L = 56, R = 12, T = 12, B = 40;
  const outOf = (r: MonthHistory) => r.billsCents + r.debtCents + r.spentCents;
  const hi = Math.max(1, ...rows.map((r) => Math.max(r.inCents, outOf(r))));
  const band = (W - L - R) / rows.length;
  const bw = Math.min(26, band / 3);
  const y = (c: number) => T + ((hi - c) / hi) * (H - T - B);
  const complete = rows.filter((r) => !r.current);
  const gap = complete.length ? Math.round(complete.reduce((s, r) => s + r.netCents, 0) / complete.length) : 0;
  return (
    <Card>
      <h2 className="text-base font-bold">Did each month live within its money?</h2>
      <p className="mt-0.5 text-xs text-muted">
        Money in against everything out: bills, the debt payment and spending.{" "}
        {complete.length ? (
          <b className={gap < 0 ? "text-danger" : "text-ok"}>
            {gap < 0
              ? `Over the last ${complete.length} full months, money out ran ${money(-gap)} a month more than money in.`
              : `Over the last ${complete.length} full months, money in ran ${money(gap)} a month more than money out.`}
          </b>
        ) : null}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Money in and out by month">
        {ticks(0, hi).map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" className="fill-muted">
              {money(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = L + band * i + band / 2;
          const out = outOf(r);
          return (
            <g key={r.month} opacity={r.current ? 0.6 : 1}>
              <rect x={cx - bw - 1} y={y(r.inCents)} width={bw} height={Math.max(0, H - B - y(r.inCents))} rx="3" fill="var(--series-1)">
                <title>{`${monthShort(r.month, true)}: ${money(r.inCents)} in`}</title>
              </rect>
              <rect x={cx + 1} y={y(out)} width={bw} height={Math.max(0, H - B - y(out))} rx="3" fill="var(--series-2)">
                <title>{`${monthShort(r.month, true)}: ${money(out)} out (bills ${money(r.billsCents)}, debt ${money(r.debtCents)}, spending ${money(r.spentCents)})`}</title>
              </rect>
              <text x={cx} y={H - B + 14} textAnchor="middle" fontSize="11" className="fill-muted">
                {monthShort(r.month)}
                {r.current ? " (so far)" : ""}
              </text>
              <text x={cx} y={H - B + 28} textAnchor="middle" fontSize="11" className={r.netCents < 0 ? "fill-danger" : "fill-ok"}>
                {r.netCents < 0 ? `−${money(-r.netCents)}` : `+${money(r.netCents)}`}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--series-1)]" />Money in</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--series-2)]" />Money out</li>
        <li>The number under each month is in minus out.</li>
      </ul>
    </Card>
  );
}
