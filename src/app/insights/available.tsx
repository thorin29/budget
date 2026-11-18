/**
 * Available to spend: one figure, how long it holds, and how it's worked out, line by line, from
 * checking today to the tightest point. Plus whether spending it stays within this month's income.
 */

import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import type { Available } from "@/lib/available";
import type { Case, CarryOver, Stretch } from "./outlook";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const signed = (cents: number) => (cents < 0 ? `−$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}` : `+$${Math.round(cents / 100).toLocaleString("en-US")}`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const sum = (ls: Array<{ cents: number }>) => ls.reduce((t, l) => t + l.cents, 0);

export function AvailableCard({ a, mode, toggle, stretches, carry, thisMonth }: { a: Available; mode: Case; toggle: ReactNode; stretches: Stretch[]; carry: CarryOver; thisMonth: string }) {
  // The stretches up to the tightest point: spending more than this runs short there.
  const tightAt = a.limit ? stretches.findIndex((s) => a.limit!.date >= s.from && a.limit!.date <= s.to) : -1;
  const upTo = stretches.slice(0, tightAt + 1);
  const rows: Array<[string, number]> = [
    ["Checking today", carry.checkingCents],
    [`${thisMonth} pay still coming`, carry.incomeCents],
    [`${thisMonth} bills, cards and debt still owed`, -carry.owedCents],
    ...(mode === "worst" ? ([[`${thisMonth} budgets left, used in full`, -carry.budgetLeftCents]] as Array<[string, number]>) : []),
  ];
  for (const [i, s] of upTo.entries()) {
    for (const p of s.pay) rows.push([`${p.name} (${day(p.date)})`, p.cents]);
    const out = sum(s.bills) + sum(s.debt);
    if (out) rows.push([i === 0 && stretches.length > 1 ? `Bills before ${day(stretches[1].from)} pay` : `Bills ${day(s.from)}–${day(s.to)}`, -out]);
  }
  const remaining = mode === "worst" ? carry.remainingCents - carry.budgetLeftCents : carry.remainingCents;
  const withinIncome = a.cents <= Math.max(0, remaining);

  return (
    <Card>
      <h2 className="text-base font-bold">Available to spend</h2>
      <div className="mt-3">{toggle}</div>
      <p className={`tnum mt-3 text-4xl font-bold ${a.shortCents > 0 ? "text-danger" : "text-ok"}`}>{money(a.shortCents > 0 ? -a.shortCents : a.cents)}</p>
      <p className="mt-1 text-sm text-muted">Until {day(a.until)}</p>

      <dl className="mt-3 border-t border-line text-sm">
        {rows.map(([label, cents], i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-muted">{label}</dt>
            <dd className="tnum">{i === 0 ? money(cents) : signed(cents)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 font-semibold">
          <dt>Available to spend</dt>
          <dd className={`tnum ${a.shortCents > 0 ? "text-danger" : "text-ok"}`}>{money(a.shortCents > 0 ? -a.shortCents : a.cents)}</dd>
        </div>
        {a.shortCents === 0 ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5">
            <dt className="text-muted">Every bill through {day(a.until)} still paid if all of it is spent</dt>
            <dd className="font-semibold text-ok">Yes</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5">
          <dt className="text-muted">{thisMonth}&rsquo;s income after its expenses</dt>
          <dd className={`tnum font-semibold ${remaining < 0 ? "text-danger" : ""}`}>{money(remaining)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5">
          <dt className="text-muted">Spending all of it stays within {thisMonth}&rsquo;s income</dt>
          <dd className={`font-semibold ${withinIncome ? "text-ok" : "text-danger"}`}>{withinIncome ? "Yes" : remaining > 0 ? `No, only ${money(remaining)}` : "No"}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted">{mode === "worst" ? "Available funds using current and budgeted expenses." : "Available funds using current expenses only."}</p>
    </Card>
  );
}
