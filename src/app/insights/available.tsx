"use client";

/**
 * Available to spend: what can go out on top of everything already owed and planned, with every
 * card still paid in full and every bill paid through the date shown. Under it, the projected bank
 * balance (lowest point and on the last date) as things stand. "Details" opens the
 * breakdown, line by line from the current balance; drag its title bar to move it. The
 * worst/best case choice comes from the Outlook card above it.
 */

import { useRef, useState } from "react";
import { Card } from "@/components/ui";
import type { Available } from "@/lib/available";
import type { BankPath, Case, CarryOver, Stretch } from "./outlook";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const signed = (cents: number) => (cents < 0 ? `−$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}` : `+$${Math.round(cents / 100).toLocaleString("en-US")}`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const sum = (ls: Array<{ cents: number }>) => ls.reduce((t, l) => t + l.cents, 0);

export function AvailableCard({
  a,
  mode,
  stretches,
  carry,
  thisMonth,
  bank,
  cushionCents = 0,
  className = "",
}: {
  a: Available;
  mode: Case;
  stretches: Stretch[];
  carry: CarryOver;
  thisMonth: string;
  bank: BankPath | null;
  cushionCents?: number;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // The stretches up to the tightest point: spending more than this runs short there.
  const tightAt = a.limit ? stretches.findIndex((s) => a.limit!.date >= s.from && a.limit!.date <= s.to) : -1;
  const rows: Array<[string, number]> = [
    ["Current balance", carry.checkingCents],
    [`${thisMonth} pay still coming`, carry.incomeCents],
    [`${thisMonth} bills, cards and debt still owed`, -carry.owedCents],
    ...(mode === "worst" ? ([[`${thisMonth} budgets left, used in full`, -carry.budgetLeftCents]] as Array<[string, number]>) : []),
    ...(cushionCents ? ([["Minimum cushion, kept in checking", -cushionCents]] as Array<[string, number]>) : []),
  ];
  for (const [i, s] of stretches.slice(0, tightAt + 1).entries()) {
    for (const p of s.pay) rows.push([`${p.name} (${day(p.date)})`, p.cents]);
    const out = sum(s.bills) + sum(s.debt);
    if (out) rows.push([i === 0 && stretches.length > 1 ? `Bills before ${day(stretches[1].from)} pay` : `Bills ${day(s.from)}–${day(s.to)}`, -out]);
  }
  const figure = a.shortCents > 0 ? -a.shortCents : a.cents;
  const caseLabel = mode === "worst" ? "Worst case" : "Best case";

  const open = () => {
    setOffset({ x: 0, y: 0 });
    dialog.current?.showModal();
  };

  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Available to Spend</h2>
        <span className="text-xs text-muted">{caseLabel}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <span className={`tnum text-4xl font-bold ${figure < 0 ? "text-danger" : "text-ok"}`}>{money(figure)}</span>
        <span className="text-sm text-muted">until {day(a.until)}</span>
      </div>
      {bank ? (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Projected bank balance</p>
            <button type="button" onClick={open} className="text-xs font-semibold text-muted hover:text-foreground">
              Details
            </button>
          </div>
          <dl className="mt-1 divide-y divide-line text-sm">
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-muted">Lowest, {day(bank.lowOn)}</dt>
              <dd className={`tnum font-semibold ${bank.lowCents < 0 ? "text-danger" : ""}`}>{money(bank.lowCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-muted">On {day(bank.endOn)}</dt>
              <dd className={`tnum font-semibold ${bank.endCents < 0 ? "text-danger" : ""}`}>{money(bank.endCents)}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      {bank ? null : (
        <div className="mt-auto pt-3">
          <button type="button" onClick={open} className="text-xs font-semibold text-muted hover:text-foreground">
            Details
          </button>
        </div>
      )}

      <dialog
        ref={dialog}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 text-foreground shadow-card backdrop:bg-black/40"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="p-5">
          <div
            className="-mx-5 -mt-5 flex cursor-move touch-none select-none items-baseline justify-between gap-3 rounded-t-2xl px-5 pt-5 pb-1"
            title="Drag to move"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d) setOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
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
          </dl>
          <p className="mt-3 text-xs text-muted">{mode === "worst" ? "Available funds using current and budgeted expenses." : "Available funds using current expenses only."}</p>
        </div>
      </dialog>
    </Card>
  );
}
