/**
 * The Budget tab's card pieces: the By card box (the month's money split by where it was paid),
 * one card's statement view, and the checks line.
 */

import Link from "next/link";
import { Card } from "@/components/ui";
import type { CardRow, CardSection, Check, StatementView } from "@/server/card-view";
import { Bar, COLOR, GRID, SUMMARY, day, money, tone } from "./forecast";

const SECTION: Record<CardSection["tier"], { name: string; color: string }> = {
  BILLS: { name: "Bills", color: "var(--series-1)" },
  ESSENTIAL: { name: "Essentials", color: COLOR.ESSENTIAL },
  FLEXIBLE: { name: "Extras", color: COLOR.FLEXIBLE },
  UNPLANNED: { name: "Unplanned", color: COLOR.UNPLANNED },
};
const result = (budget: number | null, projected: number, bills = false) =>
  bills ? <span className="text-muted">as planned</span> : budget === null || budget === 0 ? <span className="text-muted">—</span> : <span className={tone(budget - projected, false)}>{budget - projected < 0 ? `${money(projected - budget)} over` : `${money(budget - projected)} under`}</span>;

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

function Cells({ spent, budget, projected, bills = false, closed }: { spent: number; budget: number | null; projected: number; bills?: boolean; closed: boolean }) {
  return (
    <>
      <span className="tnum text-right">{money(spent)}</span>
      <span className="tnum text-right">{budget ? money(budget) : "none"}</span>
      <span className={`tnum text-right ${budget && budget - spent < 0 ? "text-danger" : ""}`}>{budget ? money(budget - spent) : ""}</span>
      <span className="tnum text-right">{closed ? "" : money(projected)}</span>
      <span className="text-right">{closed ? null : result(budget, projected, bills)}</span>
    </>
  );
}

function note(r: CardRow): string {
  if (r.kind === "checking") return "bills paid from checking, debit purchases";
  if (r.kind === "promo") return "debt payment only";
  return [
    r.typicalCents ? `typical month ${money(r.typicalCents)}` : null,
    r.paymentLineCents ? `payment line ${money(r.paymentLineCents)}` : null,
    r.closesOn ? `statement closes ${day(r.closesOn)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The By card box: card rows that open to their sections and budgets. Already counted above and below. */
export function CardsBox({ cards, closed, statementLinks }: { cards: CardRow[]; closed: boolean; statementLinks: Record<string, string> }) {
  if (!cards.length) return null;
  return (
    <div className="my-3 rounded-xl border border-dashed border-line-strong bg-neutral-soft/40 px-2 py-2">
      <p className="px-2 pb-1 text-xs text-muted">
        <b className="text-foreground">By card</b> · the same money as the sections, split by where it was paid
      </p>
      {cards.map((r) => (
        <details key={r.key} className="group/card border-b border-line/60 last:border-b-0">
          <summary className={`${GRID} py-2 text-sm ${SUMMARY}`}>
            <span className="min-w-0 pl-1">
              <span className="font-semibold">
                <span aria-hidden className="mr-1 inline-block w-3 text-muted transition-transform group-open/card:rotate-90">›</span>
                {r.name}
              </span>
              <span className="block truncate pl-4 text-xs text-muted">{note(r)}</span>
            </span>
            <Segments row={r} />
            <Cells spent={r.spentCents} budget={r.budgetCents} projected={r.projectedCents} bills={r.kind !== "card"} closed={closed} />
          </summary>
          <div className="pb-2">
            {r.sections
              .filter((s) => s.spentCents || s.budgetCents || s.projectedCents)
              .map((s) => (
                <div key={s.tier}>
                  <div className={`${GRID} py-1 text-[13px] font-semibold`}>
                    <span className="flex items-center gap-2 pl-6">
                      <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: SECTION[s.tier].color }} />
                      {s.tier === "BILLS" ? (r.kind === "checking" ? "Bills from checking" : r.kind === "promo" ? "Debt payment" : "Bills on this card") : SECTION[s.tier].name}
                    </span>
                    <Bar spent={s.spentCents} forecast={s.projectedCents} limit={s.budgetCents || null} color={SECTION[s.tier].color} />
                    <Cells spent={s.spentCents} budget={s.budgetCents} projected={s.projectedCents} bills={s.tier === "BILLS"} closed={closed} />
                  </div>
                  {s.groups
                    .filter((g) => g.spentCents || g.budgetCents || g.projectedCents)
                    .map((g) => (
                      <div key={g.id} className={`${GRID} py-0.5 text-xs text-muted`}>
                        <span className="truncate pl-12">
                          {g.name}
                          {g.sharePct > 0 && g.sharePct < 95 ? <span className="ml-1">({g.sharePct}% usually here)</span> : null}
                        </span>
                        <Bar spent={g.spentCents} forecast={g.projectedCents} limit={g.budgetCents || null} color={SECTION[s.tier].color} />
                        <Cells spent={g.spentCents} budget={g.budgetCents} projected={g.projectedCents} closed={closed} />
                      </div>
                    ))}
                </div>
              ))}
            {statementLinks[r.key] ? (
              <Link href={statementLinks[r.key]} className="ml-12 mt-1 inline-block text-xs font-semibold text-accent-text hover:underline">
                See this card by statement →
              </Link>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

/** One card from its last statement date: where it stands today. */
export function StatementPanel({ v }: { v: StatementView }) {
  const perDay = (c: number) => (v.daysLeft > 0 ? `${money(c / v.daysLeft)}/day` : "");
  const pct = Math.round((v.day / v.days) * 100);
  const tiles = [
    { k: "Charged so far", v: money(v.chargedCents), s: `since ${day(v.from)}` },
    { k: "Bills still to come on this card", v: money(v.billsToComeCents), s: `before ${day(v.to)}` },
    { k: "Room left in budgets", v: money(v.roomCents), s: v.daysLeft ? `about ${perDay(v.roomCents)} for ${v.daysLeft} days` : "statement closes today", good: true },
    { k: "Statement, projected", v: money(v.projectedCents), s: v.dueOn ? `due ${day(v.dueOn)}` : "at this pace" },
  ];
  return (
    <Card>
      <h2 className="text-lg font-bold">
        {v.card.name} · statement {day(v.from)} – {day(v.to)}
      </h2>
      <p className="text-sm text-muted">
        Day {v.day} of {v.days} · closes in {v.daysLeft} day{v.daysLeft === 1 ? "" : "s"}
        {v.dueOn ? ` · due ${day(v.dueOn)}` : ""}
      </p>
      <div className="mt-2 h-2 rounded-full bg-neutral-soft">
        <div className="h-2 rounded-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-xl bg-neutral-soft px-4 py-3">
            <p className="text-xs text-muted">{t.k}</p>
            <p className={`tnum text-2xl font-bold ${t.good ? "text-ok" : ""}`}>{t.v}</p>
            <p className="text-xs text-muted">{t.s}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[820px]">
          <div className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.8fr)_repeat(5,minmax(0,0.72fr))_minmax(0,0.9fr)] items-center gap-3 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wider text-muted`}>
            <span>On the {v.card.name}</span>
            <span>Actual · Projection · Budget</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Budget</span>
            <span className="text-right">Remaining</span>
            <span className="text-right">Per day</span>
            <span className="text-right">Projected</span>
            <span className="text-right">By {day(v.to)}</span>
          </div>
          {v.sections.map((s) => {
            if (!s.spentCents && !s.budgetCents && !s.projectedCents && !s.bills.length) return null;
            const bills = s.tier === "BILLS";
            const G8 = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.8fr)_repeat(5,minmax(0,0.72fr))_minmax(0,0.9fr)] items-center gap-3";
            const line = (name: React.ReactNode, spent: number, budget: number | null, projected: number, cls: string, sub = false) => (
              <div className={`${G8} ${cls}`}>
                <span className={`flex min-w-0 items-center gap-2 ${sub ? "pl-6" : ""}`}>{name}</span>
                <Bar spent={spent} forecast={projected} limit={budget || null} color={SECTION[s.tier].color} />
                <span className="tnum text-right">{money(spent)}</span>
                <span className="tnum text-right">{budget ? money(budget) : "none"}</span>
                <span className={`tnum text-right ${budget && budget - spent < 0 ? "text-danger" : ""}`}>{budget ? money(budget - spent) : ""}</span>
                <span className="tnum text-right">{!bills && budget ? perDay(Math.max(0, budget - spent)) : ""}</span>
                <span className="tnum text-right">{money(projected)}</span>
                <span className="text-right">{result(budget, projected, bills)}</span>
              </div>
            );
            return (
              <details key={s.tier} className="group mt-2" open>
                <summary className={`${SUMMARY} -mx-2 block rounded-lg bg-neutral-soft px-2`}>
                  {line(
                    <>
                      <span aria-hidden className="inline-block w-3 text-muted transition-transform group-open:rotate-90">›</span>
                      <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: SECTION[s.tier].color }} />
                      {bills ? "Bills on this card" : SECTION[s.tier].name}
                    </>,
                    s.spentCents, s.budgetCents, s.projectedCents, "border-b border-line py-2 text-sm font-bold",
                  )}
                </summary>
                {bills
                  ? s.bills.map((b) => (
                      <div key={`${b.lineItemId}-${b.dueOn}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem_6rem] gap-3 border-b border-line/60 py-1 pl-8 text-xs">
                        <span className="text-muted">{day(b.dueOn)}</span>
                        <span className="truncate">{b.name}</span>
                        <span className={b.paid ? "text-ok" : "text-muted"}>{b.paid ? "charged" : "to come"}</span>
                        <span className="tnum pr-2 text-right">{money(b.cents)}</span>
                      </div>
                    ))
                  : s.groups.map((g) => (
                      <div key={g.id}>
                        {line(
                          <span className="truncate">
                            {g.name}
                            {g.sharePct > 0 && g.sharePct < 95 ? <span className="ml-1 text-xs text-muted">({g.sharePct}% usually on this card)</span> : null}
                          </span>,
                          g.spentCents, g.budgetCents, g.projectedCents, "border-b border-line/60 py-1.5 text-sm text-muted", true,
                        )}
                      </div>
                    ))}
              </details>
            );
          })}
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.8fr)_repeat(5,minmax(0,0.72fr))_minmax(0,0.9fr)] items-center gap-3 border-t-2 border-line pt-3 text-sm font-bold">
            <span>This statement</span>
            <span />
            <span className="tnum text-right">{money(v.totals.spentCents)}</span>
            <span className="tnum text-right">{money(v.totals.budgetCents)}</span>
            <span className="tnum text-right">{money(v.totals.budgetCents - v.totals.spentCents)}</span>
            <span />
            <span className="tnum text-right">{money(v.totals.projectedCents)}</span>
            <span className="text-right">{result(v.totals.budgetCents, v.totals.projectedCents)}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">The month&rsquo;s budgets, counted from the statement date: this card&rsquo;s usual share of each. They start over when the statement closes.</p>
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
