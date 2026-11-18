"use client";

/**
 * Outlook: next month up to the second paycheck. It starts from what this month carries over,
 * with a toggle between "Right now" and "If budgets are used", then runs through the pay and
 * bills in date order to show whether checking covers everything before that paycheck.
 */

import { useState } from "react";
import Link from "next/link";
import { Card, Segmented } from "@/components/ui";
import type { OutlookView, OutlookLine } from "@/server/outlook";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

type Mode = "now" | "budgets";

export function Outlook({
  outlook,
  nowCents,
  budgetsCents,
  budgetLeftCents,
  thisMonth,
}: {
  outlook: OutlookView;
  /** Carries over right now (the bank check). */
  nowCents: number;
  /** Carries over if this month's budgets are used. */
  budgetsCents: number;
  budgetLeftCents: number;
  /** This month's name, e.g. "November". */
  thisMonth: string;
}) {
  const [mode, setMode] = useState<Mode>("now");
  const start = mode === "now" ? nowCents : budgetsCents;

  type Row = OutlookLine & { kind: "pay" | "bill" | "debt" };
  const rows: Row[] = [
    ...outlook.pay.map((l) => ({ ...l, kind: "pay" as const })),
    ...outlook.bills.map((l) => ({ ...l, kind: "bill" as const })),
    ...outlook.debt.map((l) => ({ ...l, kind: "debt" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "pay" ? 0 : 1) - (b.kind === "pay" ? 0 : 1) || a.name.localeCompare(b.name));

  let balance = start;
  let low = start;
  let shortOn: string | null = start < 0 ? outlook.from : null;
  const steps = rows.map((r) => {
    balance += r.kind === "pay" ? r.cents : -r.cents;
    if (balance < low) low = balance;
    if (balance < 0 && !shortOn) shortOn = r.date;
    return { ...r, balance };
  });
  void steps;
  const end = balance;
  // The paycheck in this stretch (the one before the paycheck that ends it); other income, like a monthly benefit, on its own line above.
  const paycheck = outlook.nextPay ? ([...outlook.pay].reverse().find((l) => l.name.toLowerCase().replace(/[\s#]*\d+$/, "") === outlook.nextPay!.name.toLowerCase().replace(/[\s#]*\d+$/, "")) ?? null) : null;
  const otherPay = outlook.pay.filter((l) => l !== paycheck);
  const billCount = outlook.bills.length + outlook.debt.length;
  const payIn = outlook.pay.reduce((t, l) => t + l.cents, 0);
  const billsOut = outlook.bills.reduce((t, l) => t + l.cents, 0) + outlook.debt.reduce((t, l) => t + l.cents, 0);
  const cardsCents = outlook.cards.reduce((t, c) => t + c.cents, 0);
  const until = outlook.nextPay ? `the ${day(outlook.nextPay.date)} paycheck` : `the end of the month`;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Outlook</h2>
        <span className="text-xs text-muted">
          {day(outlook.from)} to {day(outlook.to)}, until {until}
        </span>
      </div>
      <div className="mt-3">
        <Segmented
          name="outlook-mode"
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { value: "now", label: "Right now" },
            { value: "budgets", label: "If budgets are used" },
          ]}
        />
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-neutral-soft px-3.5 py-2.5 text-sm">
        <span>Carries over from {thisMonth}</span>
        <b className={`tnum ${start < 0 ? "text-danger" : ""}`}>{money(start)}</b>
      </div>

      <ul className="mt-2 divide-y divide-line text-sm">
        {otherPay.map((l, i) => (
          <li key={`pay-${i}`} className="flex items-baseline justify-between gap-3 py-2.5">
            <span>
              <span className="font-semibold">{l.name}</span> <span className="text-xs text-muted">· {weekday(l.date)}, {day(l.date)} · expected</span>
            </span>
            <span className="tnum font-semibold text-ok">+{money(l.cents)}</span>
          </li>
        ))}
        <li className="py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span>
              <span className="font-semibold">Bills</span>{" "}
              <span className="text-xs text-muted">
                · {outlook.bills.length} {outlook.bills.length === 1 ? "bill" : "bills"}
                {outlook.debt.length ? " and the debt payment" : ""}, {day(outlook.from)} to {day(outlook.to)}
              </span>
            </span>
            <span className="tnum font-semibold">−{money(billsOut)}</span>
          </div>
          {billCount ? (
            <details className="mt-1 text-xs text-muted">
              <summary className="cursor-pointer select-none hover:text-foreground">Show the bills</summary>
              <ul className="mt-1 space-y-0.5">
                {[...outlook.bills, ...outlook.debt]
                  .sort((x, y) => x.date.localeCompare(y.date))
                  .map((l, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>
                        {day(l.date)} · {l.name}
                      </span>
                      <span className="tnum">{money(l.cents)}</span>
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </li>
        {paycheck ? (
          <li className="flex items-baseline justify-between gap-3 py-2.5">
            <span>
              <span className="font-semibold">{paycheck.name}</span> <span className="text-xs text-muted">· {weekday(paycheck.date)}, {day(paycheck.date)} · estimate</span>
            </span>
            <span className="tnum font-semibold text-ok">+{money(paycheck.cents)}</span>
          </li>
        ) : null}
      </ul>

      <div className={`mt-2 rounded-xl px-3.5 py-2.5 text-sm ${shortOn ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>
        <div className="font-semibold">
          {shortOn ? `Short ${money(-low)} on ${day(shortOn)}` : `Left before ${until}: ${money(end)}`}
        </div>
        <div className="mt-0.5 text-xs">
          {money(start)} carried over + {money(payIn)} pay − {money(billsOut)} bills and debt
          {shortOn ? ` leaves ${money(end)} by ${day(outlook.to)}; the low point is ${money(low)}.` : low < end ? `. Lowest along the way: ${money(low)}.` : "."}
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted">
        {cardsCents > 0 || (mode === "budgets" && budgetLeftCents > 0) ? (
          <p>
            <b className="font-semibold text-foreground">Next card payments, already set aside in the carry-over:</b>{" "}
            {outlook.cards.map((c) => `${c.name} ${money(c.cents)}${c.due ? ` (next due ${day(c.due)})` : ""}`).join(" · ")}
            {mode === "budgets" && budgetLeftCents > 0 ? `${cardsCents > 0 ? " · " : ""}plus ${money(budgetLeftCents)} of ${thisMonth}'s budgets still to be charged` : ""}
            {mode === "budgets" && budgetLeftCents > 0 ? ` ≈ ${money(cardsCents + budgetLeftCents)} in all` : ""}.
          </p>
        ) : null}
        {outlook.onCard.length ? (
          <p>
            <b className="font-semibold text-foreground">Charged to a card in this stretch</b> (paid with the card later):{" "}
            {outlook.onCard.map((l) => `${l.name} ${money(l.cents)}`).join(" · ")}.
          </p>
        ) : null}
        <p>
          Spending in {day(outlook.from).split(" ")[0]} goes on the cards and is paid the month after, so it isn&rsquo;t here.{" "}
          <Link href="/insights/cash" className="text-accent-text hover:underline">
            Day by day ›
          </Link>
        </p>
      </div>
    </Card>
  );
}
