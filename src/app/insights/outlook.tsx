"use client";

/**
 * Outlook and Available to spend, sharing one worst/best case choice.
 *
 * Outlook: next month in two stretches, before payday and from payday to the day before the
 * paycheck after it. Each stretch starts from what's on hand (the carry-over plus any income
 * landing before payday, like a monthly benefit; then what's left plus the paycheck), takes off
 * its bills and the debt payment, and ends with what's left.
 *
 * Available to spend: the most that can go out today with every bill through the window still
 * paid, which is the lowest point along the way (src/lib/available.ts).
 */

import { useState } from "react";
import { Card, Segmented } from "@/components/ui";
import type { OutlookView, OutlookLine } from "@/server/outlook";
import { available } from "@/lib/available";
import { AvailableCard } from "./available";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const sum = (ls: OutlookLine[]) => ls.reduce((t, l) => t + l.cents, 0);

export type Case = "worst" | "best";

export interface Stretch {
  from: string;
  to: string;
  /** What it starts with: the carry-over, or what the stretch before left. */
  startLabel: string;
  startCents: number;
  pay: OutlookLine[];
  bills: OutlookLine[];
  debt: OutlookLine[];
  endCents: number;
  /** "the Dec 4 paycheck", or "the end of the month". */
  endsBefore: string;
}

function stretches(outlook: OutlookView, start: number, thisMonth: string): Stretch[] {
  const split = outlook.payday?.date ?? null;
  const last = outlook.nextPay ? `the ${day(outlook.nextPay.date)} paycheck` : "the end of the month";
  const ranges: Array<[string, string, string]> = split
    ? [
        [outlook.from, dayBefore(split), `the ${day(split)} paycheck`],
        [split, outlook.to, last],
      ]
    : [[outlook.from, outlook.to, last]];
  const out: Stretch[] = [];
  let carry = start;
  ranges.forEach(([from, to, endsBefore], i) => {
    const inIt = (l: OutlookLine) => l.date >= from && l.date <= to;
    const pay = outlook.pay.filter(inIt);
    const bills = outlook.bills.filter(inIt);
    const debt = outlook.debt.filter(inIt);
    const endCents = carry + sum(pay) - sum(bills) - sum(debt);
    out.push({ from, to, startLabel: i === 0 ? `Carried over from ${thisMonth}` : "Left", startCents: carry, pay, bills, debt, endCents, endsBefore });
    carry = endCents;
  });
  return out;
}

function StretchBar({ s, scale }: { s: Stretch; scale: number }) {
  const billsCents = sum(s.bills);
  const debtCents = sum(s.debt);
  const segs = [
    { key: "bills", label: `Bills (${s.bills.length})`, cents: billsCents, color: "var(--series-1)", opacity: 0.35, list: s.bills.map((l) => `${day(l.date)} · ${l.name} ${money(l.cents)}`).join("\n") },
    { key: "debt", label: "Debt payment", cents: debtCents, color: "var(--series-2)", opacity: 0.35, list: "" },
    { key: "left", label: "Left", cents: Math.max(0, s.endCents), color: "var(--ok)", opacity: 1, list: "" },
  ].filter((g) => g.cents > 0);
  const w = (c: number) => `${Math.max(0, (c / Math.max(1, scale)) * 100)}%`;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">
          {day(s.from)}
          {s.to !== s.from ? `–${day(s.to)}` : ""}
        </span>
        <span>before {s.endsBefore}</span>
      </div>
      <div className="mt-1 text-sm text-muted">
        <b className="text-foreground">
          {s.startLabel} {money(s.startCents)}
        </b>
        {s.pay.map((l, i) => (
          <span key={i}>
            {" "}
            + {l.name} {money(l.cents)}
            <span className="text-xs"> ({day(l.date)})</span>
          </span>
        ))}
      </div>
      <div className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${money(billsCents + debtCents)} of bills and debt; ${s.endCents >= 0 ? `${money(s.endCents)} left` : `${money(-s.endCents)} short`}`}>
        {segs.map((g) => (
          <span key={g.key} className="block h-full" style={{ width: w(g.cents), background: g.color, opacity: g.opacity }} title={`${g.label}: ${money(g.cents)}${g.list ? `\n${g.list}` : ""}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {segs
            .filter((g) => g.key !== "left")
            .map((g) => (
              <li key={g.key} className="flex items-center gap-1.5" title={g.list || undefined}>
                <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.color, opacity: g.opacity }} />
                {g.label} <span className="tnum text-foreground">{money(g.cents)}</span>
              </li>
            ))}
          {segs.length === 1 && segs[0].key === "left" ? <li>No bills from checking</li> : null}
        </ul>
        <span className={`tnum text-sm font-semibold ${s.endCents < 0 ? "text-danger" : "text-ok"}`}>{s.endCents < 0 ? `Short ${money(-s.endCents)}` : `Left ${money(s.endCents)}`}</span>
      </div>
    </div>
  );
}

export function OutlookCards({
  outlook,
  nowCents,
  budgetsCents,
  budgetLeftCents,
  thisMonth,
}: {
  outlook: OutlookView;
  /** Carries over with current expenses only (the bank check's "right now"). */
  nowCents: number;
  /** Carries over with this month's budgets also used. */
  budgetsCents: number;
  budgetLeftCents: number;
  /** This month's name, e.g. "November". */
  thisMonth: string;
}) {
  const [mode, setMode] = useState<Case>("worst");
  const start = mode === "worst" ? budgetsCents : nowCents;
  const parts = stretches(outlook, start, thisMonth);
  const scale = Math.max(1, ...parts.map((s) => Math.max(0, s.startCents) + sum(s.pay)), ...parts.map((s) => sum(s.bills) + sum(s.debt)));
  // The same choice on both cards; each needs its own radio group name.
  const toggle = (name: string) => (
    <Segmented
      name={name}
      value={mode}
      onChange={(v) => setMode(v as Case)}
      options={[
        { value: "worst", label: "Worst case" },
        { value: "best", label: "Best case" },
      ]}
    />
  );
  const a = available({
    startCents: start,
    until: outlook.to,
    events: [...outlook.pay.map((l) => ({ ...l })), ...[...outlook.bills, ...outlook.debt].map((l) => ({ ...l, cents: -l.cents }))],
  });

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Outlook</h2>
          <span className="text-xs text-muted">{outlook.payday ? `Before and after the ${day(outlook.payday.date)} paycheck` : `${day(outlook.from)} to ${day(outlook.to)}`}</span>
        </div>
        <div className="mt-3">{toggle("outlook-case")}</div>
        <div className="mt-4 space-y-4 rounded-xl bg-neutral-soft px-4 py-3.5">
          {parts.map((s, i) => (
            <div key={s.from} className={i > 0 ? "border-t border-line pt-4" : ""}>
              <StretchBar s={s} scale={scale} />
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-muted">
          {outlook.cards.length || (mode === "worst" && budgetLeftCents > 0) ? (
            <div>
              <b className="font-semibold text-foreground">On the cards, already set aside in the carry-over:</b>
              <ul className="mt-0.5 space-y-0.5">
                {outlook.cards.map((c, i) => (
                  <li key={i}>
                    {c.name}:{" "}
                    {[
                      c.statementCents > 0 ? `${money(c.statementCents)} statement due ${c.dueOn ? day(c.dueOn) : ""}`.trim() : null,
                      c.buildingCents > 0 ? `${money(c.buildingCents)} charged since the last statement${c.closesOn ? `, next statement closes ${day(c.closesOn)}` : ""}` : null,
                    ]
                      .filter(Boolean)
                      .join("; ")}
                  </li>
                ))}
                {mode === "worst" && budgetLeftCents > 0 ? <li>Plus {money(budgetLeftCents)} of {thisMonth}&rsquo;s budgets still to be charged</li> : null}
              </ul>
            </div>
          ) : null}
          {outlook.onCard.length ? (
            <p>
              <b className="font-semibold text-foreground">Charged to a card in this stretch</b> (paid with the card later):{" "}
              {outlook.onCard.map((l) => `${l.name} ${money(l.cents)}`).join(" · ")}.
            </p>
          ) : null}
        </div>
      </Card>
      <AvailableCard a={a} mode={mode} toggle={toggle("available-case")} stretches={parts} />
    </>
  );
}
