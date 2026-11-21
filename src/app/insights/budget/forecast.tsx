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
const SUMMARY = "[&::-webkit-details-marker]:hidden list-none cursor-pointer";
const TIERS: Array<{ tier: ForecastRow["tier"]; name: string }> = [
  { tier: "ESSENTIAL", name: "Essentials" },
  { tier: "FLEXIBLE", name: "Extras" },
  { tier: "UNPLANNED", name: "Unplanned" },
  { tier: "SORT", name: "Needs sorting" },
];
const GRID = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_repeat(4,minmax(0,0.75fr))_minmax(0,0.9fr)] items-center gap-3";
/** Totals: the muted ink, softer than black and still clear against the light projection. */
const TOTAL = "var(--muted)";

function Bar({ spent, forecast, limit, color, unplanned = 0, thick = false }: { spent: number; forecast: number; limit: number | null; color: string; unplanned?: number; thick?: boolean }) {
  const scale = Math.max(1, limit ?? 0, forecast, spent + unplanned);
  const pct = (c: number) => `${Math.min(100, (Math.max(0, c) / scale) * 100)}%`;
  return (
    <div className={`relative rounded-full bg-neutral-soft ${thick ? "h-3.5" : "h-2.5"}`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(forecast), background: color, opacity: 0.3 }} />
      {/* With unplanned after it, the spent part ends square so the two meet on a straight line. */}
      <div className={`absolute inset-y-0 left-0 ${unplanned > 0 ? "rounded-l-full" : "rounded-full"}`} style={{ width: pct(spent), background: color }} />
      {unplanned > 0 ? <div className="absolute inset-y-0" style={{ left: pct(spent), width: pct(unplanned), background: COLOR.UNPLANNED }} /> : null}
      {limit ? <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: pct(limit) }} title={`Budget ${money(limit)}`} /> : null}
    </div>
  );
}

/** Projected over is a warning (amber); over in a month that's ended has happened (red). */
const tone = (margin: number | null, ended: boolean) => (margin === null ? "text-muted" : margin < 0 ? (ended ? "text-danger" : "text-warn") : "text-ok");

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
  // Unplanned costs come out of the same money, so they count against the budgets here too.
  const spent = totals.spentCents;
  const projected = totals.forecastCents;
  const today = totals.budgetCents - spent;
  const end = totals.budgetCents - projected;
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:[&>*]:min-h-[10rem]">
      <Card>
        <p className="text-sm text-muted">Budget remaining</p>
        <dl className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted">{closed ? "Month end" : "Today"}</dt>
            <dd className={`tnum text-3xl font-bold ${today < 0 ? "text-danger" : "text-ok"}`}>{today < 0 ? `${money(-today)} over` : money(today)}</dd>
            <dd className="text-xs text-muted">Budget − spent − unplanned</dd>
          </div>
          {closed ? null : (
            <div>
              <dt className="text-xs text-muted">Projected by {day(monthEnd)}</dt>
              <dd className={`tnum text-3xl font-bold ${end < 0 ? "text-warn" : "text-ok"}`}>{left(end)}</dd>
              <dd className="text-xs text-muted">Budget − projected − unplanned</dd>
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
          <p className="mt-2 text-xs text-muted">
            Planned checking cushion {money(minimumCents)}.{" "}
            <Link href="/settings/accounts" className="text-accent-text hover:underline">
              Change
            </Link>
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export interface BillsLine {
  /** Bills at what was paid where paid, else their budget (the projection). */
  billsCents: number;
  /** The bills' budgets. */
  billsBudgetedCents?: number;
  billsPaidCents: number;
  debtCents: number;
  debtPaidCents: number;
  /** Charges in a bill category that aren't on the bill list. */
  otherCents: number;
  /** Those charges, to list under their row. */
  other?: Array<{ id: string; date: string; name: string; cents: number; category?: string | null }>;
  /** YYYY-MM, for links to the month's transactions. */
  month?: string;
}

export { Bar, GRID, SUMMARY, COLOR, money, day, left, tone };

/** A bill's result: nothing while it's as budgeted, the difference once a charge comes in over or under. */
export function billResult(budget: number, projected: number) {
  const d = budget - projected;
  if (Math.abs(d) < 100) return <span className="text-muted">—</span>;
  return <span className={d < 0 ? "text-warn" : "text-ok"}>{d < 0 ? `${money(-d)} over` : `${money(d)} under`}</span>;
}

/** The key above every Budget tab table. */
export function Legend({ closed }: { closed: boolean }) {
  const swatch = (color: string, opacity = 1) => <span aria-hidden className="inline-block h-2.5 w-4 rounded-full" style={{ background: color, opacity }} />;
  return (
    <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
      <li className="flex items-center gap-1.5">{swatch("var(--muted)")}Solid = actual</li>
      {closed ? null : <li className="flex items-center gap-1.5">{swatch("var(--muted)", 0.3)}Lighter = projection</li>}
      <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-0.5 bg-foreground" />Line = budget</li>
    </ul>
  );
}

/** The column heads every Budget tab table shares, so the columns line up between tabs. */
export function TableHead({ end, closed }: { end: string; closed: boolean }) {
  return (
    <div className={`${GRID} border-b border-line pb-2 text-xs font-semibold uppercase tracking-wider text-muted`}>
      <span>Budget</span>
      <span>{closed ? "Actual · Budget" : "Actual · Projection · Budget"}</span>
      <span className="text-right">Spent</span>
      <span className="text-right">Budget</span>
      <span className="text-right">Remaining</span>
      <span className="text-right">{closed ? "" : "Projected"}</span>
      <span className="text-right leading-tight">{closed ? "Result" : <>Projected<br />by {day(end)}</>}</span>
    </div>
  );
}

export function ForecastTable({
  rows,
  totals,
  bills,
  monthEnd,
  closed,
  reserveCents = 0,
}: {
  rows: ForecastRow[];
  totals: Totals;
  bills: BillsLine;
  monthEnd: string;
  closed: boolean;
  /** Set aside for unplanned costs: the Unplanned row's budget. */
  reserveCents?: number;
}) {
  const cell = (show: boolean, value: string) => (closed || !show ? "" : value);
  const billsBudget = bills.billsBudgetedCents ?? bills.billsCents;
  const planned = bills.billsCents + bills.debtCents + bills.otherCents;
  const budgeted = billsBudget + bills.debtCents + bills.otherCents;
  const paid = bills.billsPaidCents + bills.debtPaidCents + bills.otherCents;
  // The whole month: bills and the debt payment in full, plus the budgets.
  const all = {
    spent: totals.spentCents + paid,
    budget: totals.budgetCents + budgeted,
    projected: totals.forecastCents + planned,
    margin: totals.marginCents + budgeted - planned,
  };
  const swatch = (color: string, opacity = 1) => <span aria-hidden className="inline-block h-2.5 w-4 rounded-full" style={{ background: color, opacity }} />;
  const chevron = <span aria-hidden className="inline-block w-3 text-muted transition-transform group-open:rotate-90">›</span>;
  const billRow = (name: string, color: string, spent: number, budget: number, total: number, strong = false, summary = false) => {
    const Tag = strong || summary ? "summary" : "div";
    return (
    <Tag key={name} className={`${GRID} border-b ${strong ? `border-line bg-neutral-soft py-2 font-bold ${SUMMARY}` : `border-line/60 py-1.5 ${summary ? SUMMARY : ""}`} ${strong ? "rounded-lg px-2 -mx-2" : ""} text-sm`}>
      <span className={`flex min-w-0 items-center gap-2 ${strong ? "" : summary ? "pl-3" : "pl-6"}`}>
        {strong ? chevron : summary ? <span aria-hidden className="inline-block w-3 text-muted transition-transform group-open/other:rotate-90">›</span> : null}
        <span aria-hidden className={`${strong ? "h-2.5 w-2.5" : "h-2 w-2"} shrink-0 rounded-sm`} style={{ background: color }} />
        <span className="truncate">{name}</span>
      </span>
      <Bar spent={spent} forecast={total} limit={budget} color={color} />
      <span className={`tnum text-right ${strong ? "" : "text-muted"}`}>{money(spent)}</span>
      <span className={`tnum text-right ${strong ? "" : "text-muted"}`}>{money(budget)}</span>
      <span className={`tnum text-right ${strong ? "" : "text-muted"}`}>{money(budget - spent)}</span>
      <span className={`tnum text-right ${strong ? "" : "text-muted"}`}>{cell(true, money(total))}</span>
      <span className="text-right">{closed && spent < total ? <span className="text-muted">{money(total - spent)} unpaid</span> : billResult(budget, total)}</span>
    </Tag>
    );
  };
  return (
    <Card>
      <Legend closed={closed} />
      <div className="overflow-x-auto overflow-y-hidden py-1 lg:overflow-visible">
        <div className="min-w-[820px]">
          <TableHead end={monthEnd} closed={closed} />
          {planned > 0 ? (
            <details className="group mt-2">
              {billRow("Bills & debt", "var(--series-1)", paid, budgeted, planned, true)}
              {billRow("Bills", "var(--series-1)", bills.billsPaidCents, billsBudget, bills.billsCents)}
              {bills.debtCents > 0 ? billRow("Debt payment", "var(--series-2)", bills.debtPaidCents, bills.debtCents, bills.debtCents) : null}
              {bills.otherCents > 0 ? (
                <details className="group/other">
                  {billRow("Charges that may be bills", "var(--series-neutral)", bills.otherCents, bills.otherCents, bills.otherCents, false, true)}
                  <ul className="border-b border-line/60 py-1.5 pl-12 text-xs">
                    {(bills.other ?? []).map((t) => (
                      <li key={`${t.id}-${t.cents}`} className="flex flex-wrap items-baseline gap-x-3 py-0.5">
                        <span className="tnum w-12 text-muted">{day(t.date)}</span>
                        <Link href={`/transactions?q=${encodeURIComponent(t.name)}${bills.month ? `&m=${bills.month}` : ""}`} className="font-semibold text-accent-text hover:underline">
                          {t.name}
                        </Link>
                        <span className="text-muted">{t.category ?? ""}</span>
                        <span className="tnum ml-auto pr-2">{money(t.cents)}</span>
                      </li>
                    ))}
                    <li className="pt-1 text-muted">Not on your bill list. Make it a bill, or give it another category, on Transactions.</li>
                  </ul>
                </details>
              ) : null}
            </details>
          ) : null}
          {TIERS.map(({ tier, name }) => {
            const list = rows.filter((r) => r.tier === tier && (r.spentCents !== 0 || r.limitCents));
            const reserve = tier === "UNPLANNED" ? reserveCents : 0;
            if (!list.length && !reserve) return null;
            const spent = list.reduce((t, r) => t + r.spentCents, 0);
            const budgeted = tier === "ESSENTIAL" || tier === "FLEXIBLE";
            const limit = budgeted ? list.reduce((t, r) => t + (r.limitCents ?? 0), 0) : reserve ? reserve : null;
            const forecast = list.reduce((t, r) => t + r.forecastCents, 0) + (closed ? 0 : Math.max(0, reserve - spent));
            const margin = limit === null ? null : closed ? limit - spent : limit - forecast;
            // Open when something in it is over (or heading over); the rest stay folded to save room.
            const open = list.some((r) => r.limitCents !== null && (r.limitCents - r.spentCents < 0 || (!closed && (r.marginCents ?? 0) < 0)));
            return (
              <details key={tier} className="group mt-2" open={open}>
                <summary className={`${GRID} -mx-2 rounded-lg border-b border-line bg-neutral-soft px-2 py-2 text-sm font-bold ${SUMMARY}`}>
                  <span className="flex items-center gap-2">
                    {chevron}
                    <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[tier] }} />
                    {name}
                  </span>
                  <Bar spent={spent} forecast={budgeted || reserve ? forecast : spent} limit={limit} color={COLOR[tier]} />
                  <span className="tnum text-right">{money(spent)}</span>
                  <span className="tnum text-right">{limit === null ? "none" : money(limit)}</span>
                  <span className={`tnum text-right ${(limit ?? 0) - spent < 0 ? "text-danger" : ""}`}>{money((limit ?? 0) - spent)}</span>
                  <span className="tnum text-right">{cell(limit !== null, money(forecast))}</span>
                  <span className={`text-right ${tone(margin, closed)}`}>{margin === null ? "—" : reserve && !budgeted ? (spent > reserve ? `${money(spent - reserve)} past reserve` : `${money(reserve - spent)} reserve left`) : left(margin)}</span>
                </summary>
                {list.map((r) => {
                  const m = r.limitCents === null ? null : closed ? r.limitCents - r.spentCents : r.marginCents;
                  return (
                    <div key={r.id} className={`${GRID} border-b border-line/60 py-1.5 text-sm`}>
                      <span className="flex min-w-0 items-center gap-2 pl-6">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: COLOR[tier] }} />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <Bar spent={r.spentCents} forecast={budgeted ? r.forecastCents : r.spentCents} limit={r.limitCents} color={COLOR[tier]} />
                      <span className="tnum text-right text-muted">{money(r.spentCents)}</span>
                      <span className="tnum text-right text-muted">{r.limitCents ? money(r.limitCents) : "none"}</span>
                      <span className={`tnum text-right ${(r.limitCents ?? 0) - r.spentCents < 0 ? "text-danger" : "text-muted"}`}>{money((r.limitCents ?? 0) - r.spentCents)}</span>
                      <span className="tnum text-right text-muted">{cell(!!r.limitCents, money(r.forecastCents))}</span>
                      <span className={`text-right font-semibold ${tone(m, closed)}`} title={r.monthly ? "A monthly charge, already in: counted once" : undefined}>
                        {m === null ? "—" : left(m)}
                      </span>
                    </div>
                  );
                })}
              </details>
            );
          })}
          {[
            { key: "all", name: "Total", spent: all.spent, budget: all.budget, projected: all.projected, margin: all.margin, first: true },
            {
              key: "spending",
              name: "Total without bills & debt",
              spent: totals.spentCents,
              budget: totals.budgetCents,
              projected: totals.forecastCents,
              margin: totals.marginCents,
              first: false,
            },
          ].map((t) => {
            const m = closed ? t.budget - t.spent : t.margin;
            return (
              <div key={t.key} className={`${GRID} text-sm font-bold ${t.first ? "mt-1 border-t-2 border-line pt-3 pb-1" : "py-1"}`}>
                <span>{t.name}</span>
                <Bar spent={t.spent - totals.unplannedCents} unplanned={totals.unplannedCents} forecast={closed ? t.spent : t.projected} limit={t.budget} color={TOTAL} thick />
                <span className="tnum text-right">{money(t.spent)}</span>
                <span className="tnum text-right">{money(t.budget)}</span>
                <span className={`tnum text-right ${t.budget - t.spent < 0 ? "text-danger" : ""}`}>{money(t.budget - t.spent)}</span>
                <span className="tnum text-right">{cell(true, money(t.projected))}</span>
                <span className={`text-right ${m < 0 ? (closed ? "text-danger" : "text-warn") : "text-ok"}`}>{left(m)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
