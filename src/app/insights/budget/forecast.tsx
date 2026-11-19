/**
 * The Budget tab: each budget's spending so far (solid), where it's heading by month end
 * (lighter) and its budget (the line), in one table; a total at the bottom; and two cards on
 * top, the budgets' forecast and the checking cushion month to month.
 */

import Link from "next/link";
import { Card } from "@/components/ui";
import type { Cushion, ForecastRow, Totals } from "@/lib/budget-forecast";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const COLOR: Record<ForecastRow["tier"], string> = {
  ESSENTIAL: "var(--series-3)",
  FLEXIBLE: "var(--series-4)",
  UNPLANNED: "var(--series-5)",
  SORT: "var(--series-neutral)",
};
const TIERS: Array<{ tier: ForecastRow["tier"]; name: string }> = [
  { tier: "ESSENTIAL", name: "Essentials" },
  { tier: "FLEXIBLE", name: "Extras" },
  { tier: "UNPLANNED", name: "Unplanned" },
  { tier: "SORT", name: "Needs sorting" },
];
const GRID = "grid grid-cols-[minmax(0,1.5fr)_minmax(0,2.2fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1.1fr)] items-center gap-3";

function Bar({ spent, forecast, limit, color, unplanned = 0, thick = false }: { spent: number; forecast: number; limit: number | null; color: string; unplanned?: number; thick?: boolean }) {
  const scale = Math.max(1, limit ?? 0, forecast, spent + unplanned);
  const pct = (c: number) => `${Math.min(100, (Math.max(0, c) / scale) * 100)}%`;
  return (
    <div className={`relative rounded-full bg-neutral-soft ${thick ? "h-3.5" : "h-2.5"}`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(forecast), background: color, opacity: 0.3 }} />
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(spent), background: color }} />
      {unplanned > 0 ? <div className="absolute inset-y-0" style={{ left: pct(spent), width: pct(unplanned), background: COLOR.UNPLANNED }} /> : null}
      {limit ? <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: pct(limit) }} title={`Budget ${money(limit)}`} /> : null}
    </div>
  );
}

function status(margin: number | null): { text: string; cls: string } {
  if (margin === null) return { text: "—", cls: "text-muted" };
  return margin < 0 ? { text: `${money(-margin)} over`, cls: "text-warn" } : { text: `${money(margin)} under`, cls: "text-ok" };
}

export function ForecastCards({ totals, cushion, minimumCents, monthEnd, nextMonth, closed }: { totals: Totals; cushion: Cushion | null; minimumCents: number; monthEnd: string; nextMonth: string; closed: boolean }) {
  const budgeted = totals.forecastCents - totals.unplannedCents;
  const margin = totals.budgetCents - budgeted;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <p className="text-sm text-muted">{closed ? "Budgets, how the month ended" : `Budgets, forecast for ${day(monthEnd)}`}</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
          <p className={`tnum text-3xl font-bold ${margin < 0 ? "text-warn" : "text-ok"}`}>{margin < 0 ? `${money(-margin)} over` : `${money(margin)} under`}</p>
          <p className="text-right text-sm text-muted">
            {money(totals.spentCents - totals.unplannedCents)} spent{closed ? "" : ` · heading for ${money(budgeted)}`}
            <br />
            of {money(totals.budgetCents)} budgeted for Essentials and Extras
          </p>
        </div>
      </Card>
      {cushion ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm text-muted">Checking cushion, after every card is paid</p>
            <p className={`text-sm font-semibold ${cushion.changeCents < 0 ? "text-danger" : "text-ok"}`}>
              {cushion.changeCents < 0 ? `${money(cushion.changeCents)} this month` : `+${money(cushion.changeCents)} this month`}
              {cushion.monthsLeft !== null ? ` · about ${cushion.monthsLeft} more month${cushion.monthsLeft === 1 ? "" : "s"} at this rate` : ""}
            </p>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-muted">Started this month</dt>
              <dd className="tnum text-2xl font-bold">{money(cushion.startCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Forecast {nextMonth} 1</dt>
              <dd className={`tnum text-2xl font-bold ${cushion.endCents < minimumCents ? "text-danger" : cushion.endCents < cushion.startCents ? "text-warn" : ""}`}>{money(cushion.endCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">A month later, if it goes the same</dt>
              <dd className={`tnum text-2xl font-bold ${cushion.nextCents < minimumCents ? "text-danger" : ""}`}>{money(cushion.nextCents)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-muted">
            Keeping at least {money(minimumCents)}.{" "}
            <Link href="/insights/settings" className="text-accent-text hover:underline">
              Change
            </Link>
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export function ForecastTable({ rows, totals, monthEnd, closed }: { rows: ForecastRow[]; totals: Totals; monthEnd: string; closed: boolean }) {
  const head = closed ? "" : "Forecast";
  return (
    <Card>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className={`${GRID} border-b border-line pb-2 text-xs font-semibold uppercase tracking-wider text-muted`}>
            <span>Budget</span>
            <span>{closed ? "Spent · line = budget" : "Spent, then forecast · line = budget"}</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Budget</span>
            <span className="text-right">{head}</span>
            <span className="text-right">{closed ? "Result" : `By ${day(monthEnd)}`}</span>
          </div>
          {TIERS.map(({ tier, name }) => {
            const list = rows.filter((r) => r.tier === tier && (r.spentCents !== 0 || r.limitCents));
            if (!list.length) return null;
            const spent = list.reduce((t, r) => t + r.spentCents, 0);
            const limit = tier === "ESSENTIAL" || tier === "FLEXIBLE" ? list.reduce((t, r) => t + (r.limitCents ?? 0), 0) : null;
            const forecast = list.reduce((t, r) => t + r.forecastCents, 0);
            const s = status(limit === null ? null : limit - forecast);
            const topScale = limit === null ? Math.max(...list.map((r) => r.spentCents), 1) : null;
            return (
              <div key={tier}>
                <div className={`${GRID} border-b border-line bg-neutral-soft/40 py-2 text-sm font-bold`}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[tier] }} />
                    {name}
                  </span>
                  <Bar spent={spent} forecast={forecast} limit={limit} color={COLOR[tier]} />
                  <span className="tnum text-right">{money(spent)}</span>
                  <span className="tnum text-right">{limit === null ? "none" : money(limit)}</span>
                  <span className="tnum text-right">{closed ? "" : limit === null ? "—" : money(forecast)}</span>
                  <span className={`text-right ${s.cls}`}>{s.text}</span>
                </div>
                {list.map((r) => {
                  const st = status(r.marginCents);
                  return (
                    <div key={r.id} className={`${GRID} border-b border-line/60 py-1.5 text-sm`}>
                      <span className="flex min-w-0 items-center gap-2 pl-4">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: COLOR[tier] }} />
                        <span className="truncate">{r.name}</span>
                      </span>
                      {topScale !== null ? (
                        <Bar spent={r.spentCents} forecast={r.spentCents} limit={null} color={COLOR[tier]} unplanned={0} />
                      ) : (
                        <Bar spent={r.spentCents} forecast={r.forecastCents} limit={r.limitCents} color={COLOR[tier]} />
                      )}
                      <span className="tnum text-right">{money(r.spentCents)}</span>
                      <span className="tnum text-right text-muted">{r.limitCents ? money(r.limitCents) : "none"}</span>
                      <span className="tnum text-right text-muted">{closed ? "" : r.limitCents ? money(r.forecastCents) : "—"}</span>
                      <span className={`text-right font-semibold ${st.cls}`} title={r.monthly ? "A monthly charge, already in: counted once" : undefined}>
                        {r.monthly && r.marginCents !== null && r.marginCents >= 0 ? `Paid · ${st.text}` : st.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className={`${GRID} mt-1 border-t-2 border-line pt-3 text-sm font-bold`}>
            <span>Total</span>
            <Bar spent={totals.spentCents - totals.unplannedCents} unplanned={totals.unplannedCents} forecast={totals.forecastCents} limit={totals.budgetCents} color="var(--series-1)" thick />
            <span className="tnum text-right">{money(totals.spentCents)}</span>
            <span className="tnum text-right">{money(totals.budgetCents)}</span>
            <span className="tnum text-right">{closed ? "" : money(totals.forecastCents)}</span>
            <span className={`text-right ${totals.marginCents < 0 ? "text-danger" : "text-ok"}`}>{totals.marginCents < 0 ? `${money(-totals.marginCents)} over` : `${money(totals.marginCents)} under`}</span>
          </div>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-4 rounded-full bg-[var(--series-1)]" />Spent</li>
        {closed ? null : <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-4 rounded-full bg-[var(--series-1)] opacity-30" />Forecast at this pace</li>}
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-4 rounded-full bg-[var(--series-5)]" />Unplanned, so far</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-0.5 bg-foreground" />Budget</li>
        <li>The total budget is Essentials plus Extras. Unplanned counts as spent and isn&rsquo;t forecast; a monthly charge counts once.</li>
        <li>
          <Link href="/insights/settings" className="text-accent-text hover:underline">Change budgets</Link>
        </li>
      </ul>
    </Card>
  );
}
