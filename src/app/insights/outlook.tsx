"use client";

/**
 * Outlook: next month up to the second paycheck, as one chart. It starts from what this month
 * carries over, with a toggle between "Right now" and "If budgets are used", adds the pay in that
 * stretch and splits it into the bills, the debt payment and what's left before that paycheck.
 */

import { useState } from "react";
import { Card, Segmented } from "@/components/ui";
import type { OutlookView, OutlookLine } from "@/server/outlook";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

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
  const billList = outlook.bills.map((l) => `${day(l.date)} · ${l.name} ${money(l.cents)}`).join("\n");
  const payIn = outlook.pay.reduce((t, l) => t + l.cents, 0);
  const billsOut = outlook.bills.reduce((t, l) => t + l.cents, 0) + outlook.debt.reduce((t, l) => t + l.cents, 0);
  const have = Math.max(0, start) + payIn;
  const debtOut = outlook.debt.reduce((t, l) => t + l.cents, 0);
  const segs = [
    { key: "bills", label: `Bills (${outlook.bills.length})`, cents: billsOut - debtOut, color: "var(--series-1)", opacity: 0.35, list: billList },
    { key: "debt", label: "Debt payment", cents: debtOut, color: "var(--series-2)", opacity: 0.35 },
    { key: "left", label: `Left before ${outlook.nextPay ? day(outlook.nextPay.date) : "month end"}`, cents: Math.max(0, end), color: "var(--ok)", opacity: 1 },
  ].filter((g) => g.cents > 0);
  const w = (c: number) => `${Math.max(0, (c / Math.max(1, have, billsOut)) * 100)}%`;
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

      <div className="mt-4 rounded-xl bg-neutral-soft px-4 py-3.5 text-sm">
        <div className="text-muted">
          <b className="text-foreground">Carried over {money(start)}</b>
          {outlook.pay.map((l, i) => (
            <span key={i}>
              {" "}
              + {l.name} {money(l.cents)}
            </span>
          ))}
        </div>
        <div className="relative mt-3">
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${money(have)} to work with; ${money(billsOut)} of bills and debt; ${end >= 0 ? `${money(end)} left` : `${money(-end)} short`}`}>
            {segs.map((g) => (
              <span key={g.key} className="block h-full" style={{ width: w(g.cents), background: g.color, opacity: g.opacity }} title={`${g.label}: ${money(g.cents)}${"list" in g && g.list ? `\n${g.list}` : ""}`} />
            ))}
          </div>
          {start > 0 && payIn > 0 ? (
            <span className="absolute -top-1.5 -bottom-1.5 w-[3px] -translate-x-1/2 rounded-full bg-foreground" style={{ left: w(start) }} title={`The carry-over ends here: ${money(start)}. The rest is pay.`} />
          ) : null}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {segs.map((g) => (
            <li key={g.key} className="flex items-center gap-1.5" title={"list" in g && g.list ? g.list : undefined}>
              <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.color, opacity: g.opacity }} />
              {g.label} <span className="tnum text-foreground">{money(g.cents)}</span>
            </li>
          ))}
        </ul>
        <p className={`mt-3 border-t border-line pt-2.5 font-semibold ${shortOn ? "text-danger" : "text-ok"}`}>
          {shortOn ? `Short ${money(-low)} on ${day(shortOn)}` : `Left before ${until}: ${money(end)}`}
        </p>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-muted">
        {outlook.cards.length || (mode === "budgets" && budgetLeftCents > 0) ? (
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
              {mode === "budgets" && budgetLeftCents > 0 ? <li>Plus {money(budgetLeftCents)} of {thisMonth}&rsquo;s budgets still to be charged</li> : null}
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
  );
}
