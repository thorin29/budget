"use client";

/**
 * Outlook and Available to spend, sharing one worst/best case choice.
 *
 * Outlook: next month from the 1st to the day before the paycheck after next, as one chart of
 * money in against money out with the payday marked through both, so it shows whether the bills
 * due before payday are covered before it lands, and what's left after the rest.
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

/**
 * One chart: money in on top, money out below, on the same scale. In: the carry-over, then each
 * deposit in the order it lands. Out: bills and the debt payment in date order, then what's left.
 * The payday line runs through both bars at the point where the paycheck lands; everything due
 * before payday has to end to the left of it to be covered before the paycheck.
 */
function OutlookChart({ outlook, start, parts }: { outlook: OutlookView; start: number; parts: Stretch[] }) {
  const payday = outlook.payday;
  const before = parts[0];
  const inSegs = [
    { key: "carry", label: "Carried over", sub: "", cents: Math.max(0, start), color: "var(--muted)", opacity: 0.45 },
    ...[...outlook.pay].sort((x, y) => x.date.localeCompare(y.date)).map((l, i) => ({ key: `pay${i}`, label: l.name, sub: day(l.date), cents: l.cents, color: "var(--foreground)", opacity: i % 2 ? 0.85 : 0.6 })),
  ].filter((g) => g.cents > 0);
  const outs = [...outlook.bills.map((l) => ({ ...l, debt: false })), ...outlook.debt.map((l) => ({ ...l, debt: true }))].sort((x, y) => x.date.localeCompare(y.date));
  const early = (d: string) => !payday || d < payday.date;
  const group = (pre: boolean, debt: boolean) => outs.filter((l) => early(l.date) === pre && l.debt === debt);
  const list = (ls: OutlookLine[]) => ls.map((l) => `${day(l.date)} · ${l.name} ${money(l.cents)}`).join("\n");
  const tag = payday ? (pre: boolean) => (pre ? ` before ${day(payday.date)}` : ` from ${day(payday.date)}`) : () => "";
  const outSegs = [
    { key: "b1", ls: group(true, false), label: `Bills${tag(true)}`, color: "var(--series-1)", opacity: 0.7 },
    { key: "d1", ls: group(true, true), label: `Debt payment${tag(true)}`, color: "var(--series-2)", opacity: 0.7 },
    { key: "b2", ls: group(false, false), label: `Bills${tag(false)}`, color: "var(--series-1)", opacity: 0.3 },
    { key: "d2", ls: group(false, true), label: `Debt payment${tag(false)}`, color: "var(--series-2)", opacity: 0.3 },
  ]
    .map((g) => ({ ...g, cents: sum(g.ls), count: g.ls.length }))
    .filter((g) => g.cents > 0);
  const inTotal = inSegs.reduce((t, g) => t + g.cents, 0);
  const outTotal = outSegs.reduce((t, g) => t + g.cents, 0);
  const end = parts[parts.length - 1].endCents;
  const scale = Math.max(1, inTotal, outTotal);
  const pct = (c: number) => (Math.max(0, c) / scale) * 100;
  // Where the paycheck lands on the money-in bar: everything that came in before it.
  const payAt = payday ? pct(Math.max(0, start) + sum(outlook.pay.filter((l) => l.date < payday.date))) : null;
  const preOut = outSegs.filter((g) => g.key.endsWith("1")).reduce((t, g) => t + g.cents, 0);

  const bar = (segs: Array<{ key: string; label: string; cents: number; color: string; opacity: number; title?: string }>, tail?: { cents: number; color: string; label: string }) => (
    <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface">
      {segs.map((g) => (
        <span key={g.key} className="block h-full" style={{ width: `${pct(g.cents)}%`, background: g.color, opacity: g.opacity }} title={g.title ?? `${g.label}: ${money(g.cents)}`} />
      ))}
      {tail && tail.cents > 0 ? <span className="block h-full" style={{ width: `${pct(tail.cents)}%`, background: tail.color }} title={`${tail.label}: ${money(tail.cents)}`} /> : null}
    </div>
  );
  const swatch = (color: string, opacity: number) => <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color, opacity }} />;

  return (
    <div>
      <div className="relative">
        {payAt !== null && payday ? (
          <>
            <span className="absolute -top-0.5 z-10 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold" style={{ left: `${Math.min(92, Math.max(8, payAt))}%` }}>
              {day(payday.date)} pay
            </span>
            <span className="absolute top-4 bottom-0 z-10 w-[3px] -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${payAt}%` }} title={`${payday.name} lands ${day(payday.date)}. Bills left of this line are due before it.`} />
          </>
        ) : null}
        <div className={payday ? "pt-5" : ""}>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Money in</span>
            <span className="tnum">{money(inTotal)}</span>
          </div>
          {bar(inSegs)}
          <div className="mb-1 mt-3 flex justify-between text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Money out</span>
            <span className="tnum">{money(outTotal)}</span>
          </div>
          {bar(
            outSegs.map((g) => ({ ...g, title: `${g.label}: ${money(g.cents)}\n${list(g.ls)}` })),
            { cents: Math.max(0, end), color: "var(--ok)", label: "Left" },
          )}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {inSegs.map((g) => (
          <li key={g.key} className="flex items-center gap-1.5">
            {swatch(g.color, g.opacity)}
            {g.label}
            {g.sub ? ` (${g.sub})` : ""} <span className="tnum text-foreground">{money(g.cents)}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {outSegs.map((g) => (
          <li key={g.key} className="flex items-center gap-1.5" title={list(g.ls)}>
            {swatch(g.color, g.opacity)}
            {g.label}
            {g.key.startsWith("b") ? ` (${g.count})` : ""} <span className="tnum text-foreground">{money(g.cents)}</span>
          </li>
        ))}
        {end > 0 ? (
          <li className="flex items-center gap-1.5">
            {swatch("var(--ok)", 1)}
            Left <span className="tnum text-foreground">{money(end)}</span>
          </li>
        ) : null}
      </ul>
      <dl className="mt-3 divide-y divide-line border-t border-line text-sm">
        {payday ? (
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-muted">
              Before the {day(payday.date)} paycheck <span className="text-xs">({money(Math.max(0, start) + sum(before.pay))} in, {money(preOut)} out)</span>
            </dt>
            <dd className={`tnum font-semibold ${before.endCents < 0 ? "text-danger" : "text-ok"}`}>{before.endCents < 0 ? `Short ${money(-before.endCents)}` : `Left ${money(before.endCents)}`}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-muted">Before {parts[parts.length - 1].endsBefore}</dt>
          <dd className={`tnum font-semibold ${end < 0 ? "text-danger" : "text-ok"}`}>{end < 0 ? `Short ${money(-end)}` : `Left ${money(end)}`}</dd>
        </div>
      </dl>
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
          <span className="text-xs text-muted">
            {day(outlook.from)} to {day(outlook.to)}
            {outlook.nextPay ? `, before the ${day(outlook.nextPay.date)} paycheck` : ""}
          </span>
        </div>
        <div className="mt-3">{toggle("outlook-case")}</div>
        <div className="mt-4 rounded-xl bg-neutral-soft px-4 py-3.5">
          <OutlookChart outlook={outlook} start={start} parts={parts} />
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
