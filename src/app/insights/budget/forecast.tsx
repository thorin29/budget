/**
 * The Budget tab: each budget's spending so far (solid), its projection to month end at this
 * pace (lighter) and its budget (the line), in one table with a total at the bottom; and two
 * cards on top, the budgets today and projected, and the checking balance month to month.
 */

import Link from "next/link";
import { Card } from "@/components/ui";
import type { Cushion, ForecastRow, Totals } from "@/lib/budget-forecast";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const left = (cents: number) => (cents < 0 ? `${money(-cents)} over` : `${money(cents)} under`);

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
const GRID = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_repeat(4,minmax(0,0.75fr))_minmax(0,1fr)] items-center gap-3";
/** Unplanned in the total bar: the spent color in stripes, so solid → stripes → light reads as one run. */
const STRIPES = "repeating-linear-gradient(135deg, var(--series-1) 0 4px, color-mix(in srgb, var(--series-1) 55%, transparent) 4px 8px)";

function Bar({ spent, forecast, limit, color, unplanned = 0, thick = false }: { spent: number; forecast: number; limit: number | null; color: string; unplanned?: number; thick?: boolean }) {
  const scale = Math.max(1, limit ?? 0, forecast, spent + unplanned);
  const pct = (c: number) => `${Math.min(100, (Math.max(0, c) / scale) * 100)}%`;
  return (
    <div className={`relative rounded-full bg-neutral-soft ${thick ? "h-3.5" : "h-2.5"}`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(forecast), background: color, opacity: 0.3 }} />
      <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: pct(spent), background: color, borderRadius: unplanned > 0 ? undefined : "9999px" }} />
      {unplanned > 0 ? <div className="absolute inset-y-0" style={{ left: pct(spent), width: pct(unplanned), background: STRIPES }} /> : null}
      {limit ? <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: pct(limit) }} title={`Budget ${money(limit)}`} /> : null}
    </div>
  );
}

const tone = (margin: number | null) => (margin === null ? "text-muted" : margin < 0 ? "text-warn" : "text-ok");

export function ForecastCards({
  totals,
  cushion,
  minimumCents,
  monthEnd,
  monthStart,
  nextMonthStart,
  nextMonthName,
  closed,
}: {
  totals: Totals;
  cushion: Cushion | null;
  minimumCents: number;
  monthEnd: string;
  monthStart: string;
  nextMonthStart: string;
  nextMonthName: string;
  closed: boolean;
}) {
  const spent = totals.spentCents - totals.unplannedCents;
  const projected = totals.forecastCents - totals.unplannedCents;
  const today = totals.budgetCents - spent;
  const end = totals.budgetCents - projected;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <p className="text-sm text-muted">Budgets · Essentials and Extras · {money(totals.budgetCents)}</p>
        <dl className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted">{closed ? "Left at month end" : "Left today"}</dt>
            <dd className={`tnum text-3xl font-bold ${today < 0 ? "text-danger" : "text-ok"}`}>{today < 0 ? `${money(-today)} over` : money(today)}</dd>
            <dd className="text-xs text-muted">{money(spent)} spent</dd>
          </div>
          {closed ? null : (
            <div>
              <dt className="text-xs text-muted">Projected by {day(monthEnd)}</dt>
              <dd className={`tnum text-3xl font-bold ${end < 0 ? "text-danger" : "text-ok"}`}>{left(end)}</dd>
              <dd className="text-xs text-muted">heading for {money(projected)} at this pace</dd>
            </div>
          )}
        </dl>
      </Card>
      {cushion ? (
        <Card>
          <p className="text-sm text-muted">Checking balance, after every card is paid in full</p>
          <dl className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-muted">{day(monthStart)}</dt>
              <dd className="tnum text-2xl font-bold">{money(cushion.startCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{day(nextMonthStart)}, projected</dt>
              <dd className={`tnum text-2xl font-bold ${cushion.endCents < minimumCents ? "text-danger" : cushion.endCents < cushion.startCents ? "text-warn" : ""}`}>{money(cushion.endCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">End of {nextMonthName}, at this spending rate</dt>
              <dd className={`tnum text-2xl font-bold ${cushion.nextCents < minimumCents ? "text-danger" : ""}`}>{money(cushion.nextCents)}</dd>
            </div>
          </dl>
          <p className={`mt-2 text-sm ${cushion.changeCents < 0 ? "text-danger" : "text-ok"}`}>
            {cushion.changeCents < 0 ? `Checking goes down ${money(-cushion.changeCents)} this month.` : `Checking goes up ${money(cushion.changeCents)} this month.`}
            {cushion.monthsLeft !== null
              ? ` At this rate it reaches your planned cushion in about ${cushion.monthsLeft} month${cushion.monthsLeft === 1 ? "" : "s"}.`
              : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            Planned checking cushion {money(minimumCents)}.{" "}
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
  const cell = (show: boolean, value: string) => (closed || !show ? "" : value);
  return (
    <Card>
      <div className="overflow-x-auto overflow-y-hidden py-1 lg:overflow-visible">
        <div className="min-w-[820px]">
          <div className={`${GRID} border-b border-line pb-2 text-xs font-semibold uppercase tracking-wider text-muted`}>
            <span>Budget</span>
            <span>{closed ? "Spent · line = budget" : "Spent, then projection · line = budget"}</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Budget</span>
            <span className="text-right">Remaining</span>
            <span className="text-right">{closed ? "" : "Projection"}</span>
            <span className="text-right">{closed ? "Result" : `Projected by ${day(monthEnd)}`}</span>
          </div>
          {TIERS.map(({ tier, name }) => {
            const list = rows.filter((r) => r.tier === tier && (r.spentCents !== 0 || r.limitCents));
            if (!list.length) return null;
            const spent = list.reduce((t, r) => t + r.spentCents, 0);
            const budgeted = tier === "ESSENTIAL" || tier === "FLEXIBLE";
            const limit = budgeted ? list.reduce((t, r) => t + (r.limitCents ?? 0), 0) : null;
            const forecast = list.reduce((t, r) => t + r.forecastCents, 0);
            const margin = limit === null ? null : closed ? limit - spent : limit - forecast;
            return (
              <div key={tier}>
                <div className={`${GRID} border-b border-line bg-neutral-soft/40 py-2 text-sm font-bold`}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[tier] }} />
                    {name}
                  </span>
                  <Bar spent={spent} forecast={budgeted ? forecast : spent} limit={limit} color={COLOR[tier]} />
                  <span className="tnum text-right">{money(spent)}</span>
                  <span className="tnum text-right">{limit === null ? "none" : money(limit)}</span>
                  <span className={`tnum text-right ${limit !== null && limit - spent < 0 ? "text-danger" : ""}`}>{limit === null ? "—" : money(limit - spent)}</span>
                  <span className="tnum text-right">{cell(limit !== null, money(forecast))}</span>
                  <span className={`text-right ${tone(margin)}`}>{margin === null ? "—" : left(margin)}</span>
                </div>
                {list.map((r) => {
                  const m = r.limitCents === null ? null : closed ? r.limitCents - r.spentCents : r.marginCents;
                  return (
                    <div key={r.id} className={`${GRID} border-b border-line/60 py-1.5 text-sm`}>
                      <span className="flex min-w-0 items-center gap-2 pl-4">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: COLOR[tier] }} />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <Bar spent={r.spentCents} forecast={budgeted ? r.forecastCents : r.spentCents} limit={r.limitCents} color={COLOR[tier]} />
                      <span className="tnum text-right">{money(r.spentCents)}</span>
                      <span className="tnum text-right text-muted">{r.limitCents ? money(r.limitCents) : "none"}</span>
                      <span className={`tnum text-right ${r.limitCents && r.limitCents - r.spentCents < 0 ? "text-danger" : "text-muted"}`}>{r.limitCents ? money(r.limitCents - r.spentCents) : "—"}</span>
                      <span className="tnum text-right text-muted">{cell(!!r.limitCents, money(r.forecastCents))}</span>
                      <span className={`text-right font-semibold ${tone(m)}`} title={r.monthly ? "A monthly charge, already in: counted once" : undefined}>
                        {m === null ? "—" : left(m)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className={`${GRID} mt-1 border-t-2 border-line pt-3 text-sm font-bold`}>
            <span>Total</span>
            <Bar spent={totals.spentCents - totals.unplannedCents} unplanned={totals.unplannedCents} forecast={closed ? totals.spentCents : totals.forecastCents} limit={totals.budgetCents} color="var(--series-1)" thick />
            <span className="tnum text-right">{money(totals.spentCents)}</span>
            <span className="tnum text-right">{money(totals.budgetCents)}</span>
            <span className={`tnum text-right ${totals.budgetCents - totals.spentCents < 0 ? "text-danger" : ""}`}>{money(totals.budgetCents - totals.spentCents)}</span>
            <span className="tnum text-right">{cell(true, money(totals.forecastCents))}</span>
            {(() => {
              const m = closed ? totals.budgetCents - totals.spentCents : totals.marginCents;
              return <span className={`text-right ${m < 0 ? "text-danger" : "text-ok"}`}>{left(m)}</span>;
            })()}
          </div>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-4 rounded-full bg-[var(--series-1)]" />Spent</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-4 rounded-full" style={{ background: STRIPES }} />Unplanned</li>
        {closed ? null : <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-4 rounded-full bg-[var(--series-1)] opacity-30" />Projection at this pace</li>}
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-0.5 bg-foreground" />Budget</li>
      </ul>
    </Card>
  );
}
