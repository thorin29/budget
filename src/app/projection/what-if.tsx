"use client";

import { useState } from "react";
import { formatCents, toDecimalString } from "@/lib/money";
import { BalanceChart } from "@/components/balance-chart";
import { TextInput } from "@/components/ui";
import { tryParseCents } from "@/lib/quick-entry";

export interface ExplorerDay {
  date: string;
  /** Days from the start of the window. */
  offset: number;
  balanceCents: number;
  events: Array<{ name: string; amountCents: number; kind: "bill" | "income" | "proposed" }>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The projection with a "what if I pay this today" slider. A payment made
 * today comes off every later balance equally, so the whole walk is
 * recomputed in the browser without a round trip.
 */
export function Explorer({
  asOf,
  horizonDays,
  openingBalanceCents,
  bufferCents,
  safeToPayCents,
  lowPoint,
  committedBeforeNextPayCents,
  nextPayDate,
  days,
  initialPayCents,
  payee,
}: {
  asOf: string;
  horizonDays: number;
  openingBalanceCents: number;
  bufferCents: number;
  safeToPayCents: number;
  lowPoint: { date: string; balanceCents: number };
  committedBeforeNextPayCents: number;
  nextPayDate: string | null;
  days: ExplorerDay[];
  initialPayCents: number;
  payee: { name: string; plannedCents: number } | null;
}) {
  const [payCents, setPayCents] = useState(initialPayCents);
  const [typed, setTyped] = useState(initialPayCents ? toDecimalString(initialPayCents) : "");

  const step = 1000;
  const sliderMax =
    Math.ceil(Math.max(safeToPayCents, payee?.plannedCents ?? 0, payCents, 50_000) * 1.25 / step) * step;

  // Shift every closing balance by today's payment.
  const shifted: ExplorerDay[] = days.map((d) => ({ ...d, balanceCents: d.balanceCents - payCents }));
  if (payCents > 0) {
    const proposed = { name: payee ? `Pay ${payee.name}` : "Proposed payment", amountCents: -payCents, kind: "proposed" as const };
    if (shifted.length && shifted[0].offset === 0) {
      shifted[0] = { ...shifted[0], events: [proposed, ...shifted[0].events] };
    } else {
      shifted.unshift({ date: asOf, offset: 0, balanceCents: openingBalanceCents - payCents, events: [proposed] });
    }
  }

  const low = shifted.length
    ? shifted.reduce((min, d) => (d.balanceCents < min.balanceCents ? d : min), shifted[0])
    : { date: lowPoint.date, offset: 0, balanceCents: lowPoint.balanceCents - payCents, events: [] };

  // What is still safe after this payment. The engine's figure already
  // accounts for the opening balance and the buffer, so subtracting keeps the
  // hero and the verdict in agreement.
  const leftSafe = safeToPayCents - payCents;
  const fits = leftSafe >= 0;
  const dips = low.balanceCents < bufferCents;
  const paydays = days.filter((d) => d.events.some((e) => e.kind === "income")).map((d) => d.offset);

  const setFromSlider = (cents: number) => {
    setPayCents(cents);
    setTyped(cents ? toDecimalString(cents) : "");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* ---------------------------------------------- hero with slider */}
        <div className="rounded-2xl bg-hero p-6 text-hero-text">
          <p className="text-sm font-medium text-hero-muted">Safe to send today</p>
          <p className="font-heading tnum mt-1 text-[40px] font-bold leading-tight tracking-tight">
            {formatCents(Math.max(safeToPayCents, 0))}
          </p>
          <p className="mt-1 text-sm text-hero-muted">
            {safeToPayCents < 0
              ? "Already short — the balance dips below zero before the window ends."
              : bufferCents > 0
                ? `Keeps at least ${formatCents(bufferCents)} in the account throughout.`
                : `Keeps the balance at or above zero for the next ${horizonDays} days.`}
          </p>

          <div className="mt-6 rounded-xl bg-white/8 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="pay-slider" className="text-sm font-semibold">
                If I pay {payee ? payee.name : "this"} today
              </label>
              <div className="relative w-36">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">$</span>
                <TextInput
                  aria-label="Payment amount"
                  inputMode="decimal"
                  value={typed}
                  placeholder="0.00"
                  onChange={(e) => {
                    setTyped(e.target.value);
                    setPayCents(tryParseCents(e.target.value) ?? 0);
                  }}
                  className="tnum pl-6 text-right font-semibold"
                />
              </div>
            </div>
            <input
              id="pay-slider"
              type="range"
              min={0}
              max={sliderMax}
              step={step}
              value={Math.min(payCents, sliderMax)}
              onChange={(e) => setFromSlider(Number(e.target.value))}
              className="mt-4 w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-hero-muted">
              <span>$0</span>
              {payee ? (
                <button
                  type="button"
                  onClick={() => setFromSlider(payee.plannedCents)}
                  className="underline-offset-2 hover:underline"
                >
                  planned {formatCents(payee.plannedCents)}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setFromSlider(Math.max(safeToPayCents, 0))}
                className="underline-offset-2 hover:underline"
              >
                safe {formatCents(Math.max(safeToPayCents, 0))}
              </button>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------- side cards */}
        <div className="grid gap-4">
          <div className={`rounded-2xl p-5 ${fits ? "bg-accent-soft" : "bg-danger-soft"}`}>
            <p className={`text-[13px] font-semibold ${fits ? "text-accent-ink" : "text-danger"}`}>
              {payCents === 0 ? "Where things stand" : fits ? "That works" : "Too much"}
            </p>
            <p className={`tnum mt-1 text-sm ${fits ? "text-accent-ink" : "text-danger"}`}>
              {payCents === 0
                ? `Slide or type an amount to see what a payment today does to the next ${horizonDays} days.`
                : fits
                  ? `After ${formatCents(payCents)} you could still send ${formatCents(leftSafe)} more. The lowest the balance gets is ${formatCents(low.balanceCents)} on ${short(low.date)}.`
                  : `That is ${formatCents(-leftSafe)} more than is safe to send today.${
                      dips
                        ? ` The balance would bottom out at ${formatCents(low.balanceCents)} on ${short(low.date)}.`
                        : " It is more than is in the account right now."
                    }`}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <p className="text-[13px] font-medium text-muted">Low point</p>
              <p
                className={`font-heading tnum mt-1 text-2xl font-bold ${
                  low.balanceCents < 0 ? "text-danger" : ""
                }`}
              >
                {formatCents(low.balanceCents)}
              </p>
              <p className="mt-0.5 text-xs text-muted">on {short(low.date)}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <p className="text-[13px] font-medium text-muted">Due before next payday</p>
              <p className="font-heading tnum mt-1 text-2xl font-bold">
                {formatCents(committedBeforeNextPayCents)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {nextPayDate ? `payday ${short(nextPayDate)}` : "no payday in this window"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------- chart */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Balance, next {horizonDays} days</h2>
          <p className="flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-accent" /> balance
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-over" /> low point
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-px border-l border-dashed border-info" /> payday
            </span>
          </p>
        </div>
        <div className="mt-4">
          <BalanceChart
            opening={openingBalanceCents}
            points={shifted.map((d) => ({ day: d.offset, balanceCents: d.balanceCents }))}
            horizonDays={horizonDays}
            lowDay={low.offset}
            paydays={paydays}
            height={200}
            showAxis
            labels={[short(asOf), short(addDays(asOf, Math.round(horizonDays / 2))), short(addDays(asOf, horizonDays))]}
          />
        </div>
      </div>

      {/* ---------------------------------------------- ledger */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-bold">Day by Day</h2>
          <p className="tnum text-xs text-muted">Starting from {formatCents(openingBalanceCents)}</p>
        </div>
        {shifted.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">Nothing scheduled in this window.</p>
        ) : (
          shifted.map((day) => {
            const isLow = day.offset === low.offset;
            return (
              <div
                key={day.date}
                className={`flex gap-4 border-b border-line px-5 py-3 last:border-b-0 ${
                  isLow ? "bg-warn-soft/60" : ""
                }`}
              >
                <span className="tnum w-14 shrink-0 pt-0.5 text-xs font-semibold text-muted">{short(day.date)}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  {day.events.map((event, i) => (
                    <div key={i} className="flex justify-between gap-3 text-sm">
                      <span className={`truncate ${event.kind === "proposed" ? "font-semibold text-info" : ""}`}>
                        {event.name}
                      </span>
                      <span
                        className={`tnum shrink-0 ${event.amountCents > 0 ? "font-semibold text-accent-text" : "text-muted"}`}
                      >
                        {formatCents(event.amountCents, { signed: true })}
                      </span>
                    </div>
                  ))}
                </div>
                <span
                  className={`tnum w-28 shrink-0 text-right text-sm ${
                    day.balanceCents < 0 ? "font-semibold text-danger" : isLow ? "font-bold" : ""
                  }`}
                >
                  {formatCents(day.balanceCents)}
                  {isLow ? <span className="block text-[11px] font-semibold text-warn">low point</span> : null}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
