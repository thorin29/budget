/**
 * The Budget tab's other views, built like the month: the By card table (the month's money split
 * by where it was paid) and one card's statement (its last statement date to the next), each
 * with the same two cards on top, the same key and the same columns. Plus the period bar and the
 * checks line.
 */

import Link from "next/link";
import { Card } from "@/components/ui";
import type { CardRow, CardSection, Check, StatementView } from "@/server/card-view";
import { Bar, COLOR, GRID, Legend, SUMMARY, TableHead, billResult, day, left, money, tone } from "./forecast";

const SECTION: Record<CardSection["tier"], { name: string; color: string }> = {
  BILLS: { name: "Bills", color: "var(--series-1)" },
  ESSENTIAL: { name: "Essentials", color: COLOR.ESSENTIAL },
  FLEXIBLE: { name: "Extras", color: COLOR.FLEXIBLE },
  UNPLANNED: { name: "Unplanned", color: COLOR.UNPLANNED },
};

/** Where the period stands: day X of Y, as a bar. Every view has one, so the page doesn't shift. */
export function PeriodBar({ from, to, day: d, days }: { from: string; to: string; day: number; days: number }) {
  const pct = Math.round((Math.min(d, days) / days) * 100);
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="shrink-0 tnum">
        {day(from)} – {day(to)} · day {d} of {days}
      </span>
      <div className="h-1.5 flex-1 rounded-full bg-neutral-soft">
        <div className="h-1.5 rounded-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 tnum">{Math.max(0, days - d)} days left</span>
    </div>
  );
}

const spendResult = (budget: number | null, projected: number) =>
  budget === null || budget === 0 ? <span className="text-muted">—</span> : <span className={tone(budget - projected, false)}>{left(budget - projected)}</span>;

/** The cells after the bar: spent, budget, remaining (with a per-day amount when given), projected, result. */
function Cells({ spent, budget, projected, bills = false, closed, perDayLeft }: { spent: number; budget: number | null; projected: number; bills?: boolean; closed: boolean; perDayLeft?: number }) {
  const rem = budget ? budget - spent : null;
  return (
    <>
      <span className="tnum text-right">{money(spent)}</span>
      <span className="tnum text-right">{budget ? money(budget) : "none"}</span>
      <span className={`tnum text-right leading-tight ${rem !== null && rem < 0 ? "text-danger" : ""}`}>
        {rem === null ? "" : money(rem)}
        {rem !== null && rem > 0 && perDayLeft ? <span className="block text-[11px] font-normal text-muted">{money(rem / perDayLeft)}/day</span> : null}
      </span>
      <span className="tnum text-right">{closed ? "" : money(projected)}</span>
      <span className="text-right">{closed ? null : bills ? billResult(budget ?? 0, projected) : spendResult(budget, projected)}</span>
    </>
  );
}

function Segments({ row }: { row: CardRow }) {
  const scale = Math.max(1, row.budgetCents, row.projectedCents, row.spentCents);
  const pct = (c: number) => `${Math.min(100, (Math.max(0, c) / scale) * 100)}%`;
  return (
    <div className="relative h-2.5 rounded-full bg-neutral-soft">
      <div className="absolute inset-y-0 left-0 rounded-full bg-muted opacity-20" style={{ width: pct(row.projectedCents) }} />
      <div className="absolute inset-y-0 left-0 flex overflow-hidden rounded-full" style={{ width: pct(row.spentCents) }}>
        {row.sections.map((s) => (s.spentCents > 0 ? <span key={s.tier} style={{ flexGrow: s.spentCents, background: SECTION[s.tier].color }} /> : null))}
      </div>
      {row.budgetCents ? <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: pct(row.budgetCents) }} /> : null}
    </div>
  );
}

function BillLines({ bills }: { bills: CardSection["bills"] }) {
  return (
    <>
      {bills.map((b) => (
        <div key={`${b.lineItemId}-${b.dueOn}`} className={`${GRID} py-0.5 text-xs text-muted`}>
          <span className="truncate pl-12">
            <span className="tnum mr-2">{day(b.dueOn)}</span>
            {b.name}
          </span>
          <span className={b.paid ? "text-ok" : ""}>{b.paid ? "charged" : "pending"}</span>
          <span className="tnum text-right">{b.paid ? money(b.cents) : ""}</span>
          <span className="tnum text-right">{money(b.budgetedCents)}</span>
          <span />
          <span className="tnum text-right">{money(b.cents)}</span>
          <span className="text-right">{b.paid ? billResult(b.budgetedCents, b.cents) : <span className="text-muted">—</span>}</span>
        </div>
      ))}
    </>
  );
}

/** One section of a card: its line, then its budgets or bills. */
function SectionLines({ s, closed, label, perDayLeft }: { s: CardSection; closed: boolean; label?: string; perDayLeft?: number }) {
  const bills = s.tier === "BILLS";
  return (
    <div>
      <div className={`${GRID} py-1 text-[13px] font-semibold`}>
        <span className="flex items-center gap-2 pl-6">
          <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: SECTION[s.tier].color }} />
          {label ?? SECTION[s.tier].name}
        </span>
        <Bar spent={s.spentCents} forecast={s.projectedCents} limit={s.budgetCents || null} color={SECTION[s.tier].color} />
        <Cells spent={s.spentCents} budget={s.budgetCents} projected={s.projectedCents} bills={bills} closed={closed} perDayLeft={bills ? undefined : perDayLeft} />
      </div>
      {bills ? (
        <BillLines bills={s.bills} />
      ) : (
        s.groups
          .filter((g) => g.spentCents || g.budgetCents || g.projectedCents)
          .map((g) => (
            <div key={g.id} className={`${GRID} py-0.5 text-xs text-muted`}>
              <span className="truncate pl-12">
                {g.name}
              </span>
              <Bar spent={g.spentCents} forecast={g.projectedCents} limit={g.budgetCents || null} color={SECTION[s.tier].color} />
              <Cells spent={g.spentCents} budget={g.budgetCents} projected={g.projectedCents} closed={closed} perDayLeft={perDayLeft} />
            </div>
          ))
      )}
    </div>
  );
}

/** The By card tab: one row per card (and checking), each opening to its sections and budgets. */
export function CardsTable({ cards, closed, monthEnd, statementLinks }: { cards: CardRow[]; closed: boolean; monthEnd: string; statementLinks: Record<string, string> }) {
  const total = { spent: cards.reduce((t, c) => t + c.spentCents, 0), budget: cards.reduce((t, c) => t + c.budgetCents, 0), projected: cards.reduce((t, c) => t + c.projectedCents, 0) };
  return (
    <Card>
      <Legend closed={closed} />
      <TableHead end={monthEnd} closed={closed} />
      {cards.map((r) => (
        <details key={r.key} className="group/card mt-2">
          <summary className={`${GRID} -mx-2 rounded-lg border-b border-line bg-neutral-soft px-2 py-2 text-sm ${SUMMARY}`}>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-bold">
                <span aria-hidden className="inline-block w-3 text-muted transition-transform group-open/card:rotate-90">›</span>
                {r.name}
              </span>
            </span>
            <Segments row={r} />
            <Cells spent={r.spentCents} budget={r.budgetCents} projected={r.projectedCents} bills={r.kind !== "card"} closed={closed} />
          </summary>
          <div className="pb-2 pt-1">
            {r.sections
              .filter((s) => s.spentCents || s.budgetCents || s.projectedCents)
              .map((s) => (
                <SectionLines key={s.tier} s={s} closed={closed} label={s.tier === "BILLS" && r.kind === "promo" ? "Debt payment" : undefined} />
              ))}
            {statementLinks[r.key] ? (
              <Link href={statementLinks[r.key]} scroll={false} className="ml-12 mt-1 inline-block text-xs font-semibold text-accent-text hover:underline">
                See this card by statement →
              </Link>
            ) : null}
          </div>
        </details>
      ))}
      <div className={`${GRID} mt-1 border-t-2 border-line pb-1 pt-3 text-sm font-bold`}>
        <span>Total</span>
        <span />
        <Cells spent={total.spent} budget={total.budget} projected={total.projected} closed={closed} />
      </div>
    </Card>
  );
}

/** The statement's two cards, built like the month's: budget remaining on the card, and the statement itself. */
export function StatementCards({ v }: { v: StatementView }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:[&>*]:min-h-[10rem]">
      <Card>
        <p className="text-sm text-muted">Budget remaining on the {v.card.name}</p>
        <dl className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted">Today</dt>
            <dd className={`tnum text-3xl font-bold ${v.budgetLeftCents < 0 ? "text-danger" : "text-ok"}`}>{v.budgetLeftCents < 0 ? `${money(-v.budgetLeftCents)} over` : money(v.budgetLeftCents)}</dd>
            <dd className="text-xs text-muted">{v.daysLeft && v.budgetLeftCents > 0 ? `about ${money(v.budgetLeftCents / v.daysLeft)} a day` : "Budget − spent − unplanned"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Projected by {day(v.to)}</dt>
            <dd className={`tnum text-3xl font-bold ${v.budgetLeftEndCents < 0 ? "text-warn" : "text-ok"}`}>{left(v.budgetLeftEndCents)}</dd>
            <dd className="text-xs text-muted">Budget − projected − unplanned</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <p className="text-sm text-muted">This statement</p>
        <dl className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-muted">Charged so far</dt>
            <dd className="tnum text-2xl font-bold">{money(v.chargedCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Bills pending</dt>
            <dd className="tnum text-2xl font-bold">{money(v.billsToComeCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Closes {day(v.to)}, projected</dt>
            <dd className="tnum text-2xl font-bold">{money(v.projectedCents)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">{v.dueOn ? `Due ${day(v.dueOn)}.` : ""}</p>
      </Card>
    </div>
  );
}

/** One card from its last statement date: the same table as the month, counted from the statement date. */
export function StatementTable({ v }: { v: StatementView }) {
  return (
    <Card>
      <Legend closed={false} />
      <TableHead end={v.to} closed={false} />
      {v.sections.map((s) => {
        if (!s.spentCents && !s.budgetCents && !s.projectedCents && !s.bills.length) return null;
        const bills = s.tier === "BILLS";
        return (
          <details key={s.tier} className="group mt-2" open={!bills || s.bills.length <= 10}>
            <summary className={`${GRID} -mx-2 rounded-lg border-b border-line bg-neutral-soft px-2 py-2 text-sm font-bold ${SUMMARY}`}>
              <span className="flex items-center gap-2">
                <span aria-hidden className="inline-block w-3 text-muted transition-transform group-open:rotate-90">›</span>
                <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: SECTION[s.tier].color }} />
                {SECTION[s.tier].name}
              </span>
              <Bar spent={s.spentCents} forecast={s.projectedCents} limit={s.budgetCents || null} color={SECTION[s.tier].color} />
              <Cells spent={s.spentCents} budget={s.budgetCents} projected={s.projectedCents} bills={bills} closed={false} perDayLeft={bills ? undefined : v.daysLeft} />
            </summary>
            {bills ? (
              <BillLines bills={s.bills} />
            ) : (
              s.groups.map((g) => (
                <div key={g.id} className={`${GRID} border-b border-line/60 py-1.5 text-sm`}>
                  <span className="flex min-w-0 items-center gap-2 pl-6">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SECTION[s.tier].color }} />
                    <span className="truncate">
                      {g.name}
                    </span>
                  </span>
                  <Bar spent={g.spentCents} forecast={g.projectedCents} limit={g.budgetCents || null} color={SECTION[s.tier].color} />
                  <Cells spent={g.spentCents} budget={g.budgetCents} projected={g.projectedCents} closed={false} perDayLeft={v.daysLeft} />
                </div>
              ))
            )}
          </details>
        );
      })}
      <div className={`${GRID} mt-1 border-t-2 border-line pb-1 pt-3 text-sm font-bold`}>
        <span>This statement</span>
        <span />
        <Cells spent={v.totals.spentCents} budget={v.totals.budgetCents} projected={v.totals.projectedCents} closed={false} />
      </div>
    </Card>
  );
}

/** The checks under the page: one line, details when something's off. */
export function ChecksLine({ checks }: { checks: Check[] }) {
  const bad = checks.filter((c) => !c.ok);
  return (
    <details className="mt-3 text-xs">
      <summary className={`${SUMMARY} inline-flex items-center gap-1.5 font-semibold ${bad.length ? "text-warn" : "text-ok"}`}>
        {bad.length ? `Checks: ${bad.length} to look at` : "Checks: all pass"}
        <span className="font-normal text-muted">(details)</span>
      </summary>
      <ul className="mt-2 space-y-1">
        {checks.map((c) => (
          <li key={c.name} className="flex gap-2">
            <span className={c.ok ? "text-ok" : "text-warn"}>{c.ok ? "✓" : "!"}</span>
            <span>
              <b>{c.name}</b> <span className="text-muted">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
