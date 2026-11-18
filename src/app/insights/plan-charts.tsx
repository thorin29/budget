/**
 * The plan's charts, each answering one question:
 *  - Where does this month's money go? (one bar: bills, debt, essentials, extras, unplanned, left)
 *  - Are we on pace? (what's left in the pool day by day against an even pace)
 *  - Is the 0% balance on track? (its balance against the end of the offer)
 *  - Did each month live within its money? (money in against money out)
 * Plain SVG; hovering a mark shows its numbers.
 */

import type { MonthPlanView } from "@/server/month-plan";
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

export function PoolBar({ plan }: { plan: MonthPlanView }) {
  const by = (t: string) => plan.groups.filter((g) => g.tier === t).reduce((s, g) => s + g.spentCents, 0);
  const parts = [
    { key: "bills", label: "Bills", cents: plan.bills.totalCents, color: "var(--series-1)" },
    { key: "debt", label: "Debt payment", cents: plan.debt.cents, color: "var(--series-2)" },
    { key: "ess", label: "Essentials", cents: by("ESSENTIAL"), color: "var(--series-3)" },
    { key: "ext", label: "Extras", cents: by("FLEXIBLE"), color: "var(--series-4)" },
    { key: "unp", label: "Unplanned", cents: by("UNPLANNED") + by("SORT"), color: "var(--series-5)" },
  ].filter((p) => p.cents > 0);
  const income = Math.max(0, plan.income.totalCents);
  const out = parts.reduce((s, p) => s + p.cents, 0);
  const left = income - out;
  const total = Math.max(income, out, 1);
  const W = 640, H = 34;
  let x = 0;
  const segs = parts.map((p) => {
    const w = (p.cents / total) * W;
    const s = { ...p, x, w };
    x += w;
    return s;
  });
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Where this month&rsquo;s money goes</h2>
        <span className="text-xs text-muted">{money(plan.income.totalCents)} in{plan.closed ? "" : ", spending so far"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="mt-3 w-full" role="img" aria-label={`Of ${money(income)} in: ${parts.map((p) => `${p.label} ${money(p.cents)}`).join(", ")}; ${left >= 0 ? `${money(left)} left` : `${money(-left)} over`}`}>
        {segs.map((s) => (
          <rect key={s.key} x={s.x + 1} y={0} width={Math.max(0, s.w - 2)} height={H} rx="4" fill={s.color}>
            <title>{`${s.label}: ${money(s.cents)} (${Math.round((s.cents / Math.max(1, income)) * 100)}% of money in)`}</title>
          </rect>
        ))}
        {left > 0 ? (
          <rect x={x + 1} y={0} width={Math.max(0, (left / total) * W - 2)} height={H} rx="4" fill="var(--series-neutral)">
            <title>{`Not spent yet: ${money(left)}`}</title>
          </rect>
        ) : null}
        {out > income ? (
          <>
            <line x1={(income / total) * W} x2={(income / total) * W} y1={-2} y2={H + 4} stroke="var(--danger)" strokeWidth="2" />
            <text x={(income / total) * W} y={H + 16} textAnchor="end" fontSize="11" className="fill-danger">
              money in
            </text>
          </>
        ) : null}
      </svg>
      <ul className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="tnum font-semibold">{money(p.cents)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: left >= 0 ? "var(--series-neutral)" : "var(--danger)" }} />
            {left >= 0 ? "Not spent yet" : "Over"}
          </span>
          <span className={`tnum font-semibold ${left < 0 ? "text-danger" : ""}`}>{money(Math.abs(left))}</span>
        </li>
      </ul>
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
