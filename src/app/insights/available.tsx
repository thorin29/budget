"use client";

/**
 * Available to spend: one figure, how long it holds, and two yes/no checks. "How it's worked out"
 * opens the breakdown, line by line from checking today to the tightest point. The worst/best
 * case choice comes from the Outlook card above it.
 */

import { useRef } from "react";
import { Card } from "@/components/ui";
import type { Available } from "@/lib/available";
import type { Case, CarryOver, Stretch } from "./outlook";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const signed = (cents: number) => (cents < 0 ? `−$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}` : `+$${Math.round(cents / 100).toLocaleString("en-US")}`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const sum = (ls: Array<{ cents: number }>) => ls.reduce((t, l) => t + l.cents, 0);

export function AvailableCard({ a, mode, stretches, carry, thisMonth, className = "" }: { a: Available; mode: Case; stretches: Stretch[]; carry: CarryOver; thisMonth: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The stretches up to the tightest point: spending more than this runs short there.
  const tightAt = a.limit ? stretches.findIndex((s) => a.limit!.date >= s.from && a.limit!.date <= s.to) : -1;
  const rows: Array<[string, number]> = [
    ["Checking today", carry.checkingCents],
    [`${thisMonth} pay still coming`, carry.incomeCents],
    [`${thisMonth} bills, cards and debt still owed`, -carry.owedCents],
    ...(mode === "worst" ? ([[`${thisMonth} budgets left, used in full`, -carry.budgetLeftCents]] as Array<[string, number]>) : []),
  ];
  for (const [i, s] of stretches.slice(0, tightAt + 1).entries()) {
    for (const p of s.pay) rows.push([`${p.name} (${day(p.date)})`, p.cents]);
    const out = sum(s.bills) + sum(s.debt);
    if (out) rows.push([i === 0 && stretches.length > 1 ? `Bills before ${day(stretches[1].from)} pay` : `Bills ${day(s.from)}–${day(s.to)}`, -out]);
  }
  const remaining = mode === "worst" ? carry.remainingCents - carry.budgetLeftCents : carry.remainingCents;
  const withinIncome = a.cents <= Math.max(0, remaining);
  const figure = a.shortCents > 0 ? -a.shortCents : a.cents;
  const caseLabel = mode === "worst" ? "Worst case" : "Best case";

  const check = (label: string, value: string, ok: boolean) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right font-semibold ${ok ? "text-ok" : "text-danger"}`}>{value}</dd>
    </div>
  );

  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Available to spend</h2>
        <span className="text-xs text-muted">{caseLabel}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <span className={`tnum text-4xl font-bold ${figure < 0 ? "text-danger" : "text-ok"}`}>{money(figure)}</span>
        <span className="text-sm text-muted">until {day(a.until)}</span>
      </div>
      <dl className="mt-3 divide-y divide-line border-t border-line text-sm">
        {check(`Every bill through ${day(a.until)} paid if all of it is spent`, a.shortCents === 0 ? "Yes" : "No", a.shortCents === 0)}
        {check(`Stays within ${thisMonth}'s income`, withinIncome ? "Yes" : remaining > 0 ? `Up to ${money(remaining)}` : "No", withinIncome)}
      </dl>
      <div className="mt-auto pt-3">
        <button type="button" onClick={() => dialog.current?.showModal()} className="text-sm font-semibold text-accent-text hover:underline">
          How it&rsquo;s worked out ›
        </button>
      </div>

      <dialog
        ref={dialog}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 text-foreground shadow-card backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-bold">Available to spend · {caseLabel.toLowerCase()}</h3>
            <button type="button" onClick={() => dialog.current?.close()} className="text-sm text-muted hover:text-foreground" aria-label="Close">
              ✕
            </button>
          </div>
          <dl className="mt-3 text-sm">
            {rows.map(([label, cents], i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 py-1">
                <dt className="text-muted">{label}</dt>
                <dd className="tnum">{i === 0 ? money(cents) : signed(cents)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 font-semibold">
              <dt>Available to spend, until {day(a.until)}</dt>
              <dd className={`tnum ${figure < 0 ? "text-danger" : "text-ok"}`}>{money(figure)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line py-1.5">
              <dt className="text-muted">{thisMonth}&rsquo;s income after its expenses</dt>
              <dd className={`tnum font-semibold ${remaining < 0 ? "text-danger" : ""}`}>{money(remaining)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            {mode === "worst" ? "Available funds using current and budgeted expenses." : "Available funds using current expenses only."} Spending more than this leaves a bill
            {a.limit ? ` on ${day(a.limit.date)}` : ""} short.
          </p>
        </div>
      </dialog>
    </Card>
  );
}
