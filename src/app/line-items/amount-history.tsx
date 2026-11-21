"use client";

/**
 * A bill's payments in stretches of about the same amount (newest first), what that says the
 * usual amount should be, and a button to set past months' budgets to what was really paid.
 */

import { useState, useTransition } from "react";
import { formatCents } from "@/lib/money";
import { changeUsualAmountAction, matchPastToPaymentsAction, type AmountState } from "./actions";

export interface AmountHistoryView {
  id: string;
  usualCents: number;
  target?: boolean;
  runs: Array<{ from: string; to: string; months: string[]; cents: number }>;
  suggestion: { kind: "steady" | "drift" | "varies"; cents: number; since: string | null; count: number } | null;
  startsFrom: string;
  payments: number;
  escrowCents: number | null;
}

export const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function AmountHistory({ h }: { h: AmountHistoryView }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<AmountState | null>(null);
  const [escrow, setEscrow] = useState(true);
  if (h.payments < 3) return null;
  const s = h.suggestion;
  return (
    <details className="rounded-xl border border-line px-3 py-2 text-sm" open={!!s}>
      <summary className="cursor-pointer text-xs font-semibold text-accent-text">
        Payment history{s ? " · amount looks out of date" : ""}
      </summary>
      {s ? (
        <div className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs">
          <p>
            {s.kind === "steady"
              ? `The last ${s.count} payments were about ${formatCents(s.cents)} (since ${monthLabel(s.since!)}); the usual amount is ${formatCents(h.usualCents)}.`
              : s.kind === "drift"
                ? `The last 3 payments kept landing off the budget; their middle is about ${formatCents(s.cents)} against ${formatCents(h.usualCents)}.`
                : `It varies; the typical of the last ${s.count} payments is ${formatCents(s.cents)} against a target of ${formatCents(h.usualCents)}.`}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              className="rounded-lg bg-accent px-2.5 py-1 font-semibold text-on-accent disabled:opacity-60"
              onClick={() => start(async () => setNote(await changeUsualAmountAction(h.id, s.cents, h.startsFrom, escrow && !!h.escrowCents, true)))}
            >
              Use {formatCents(s.cents)} from {monthLabel(h.startsFrom)}
            </button>
            {h.escrowCents ? (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={escrow} onChange={(e) => setEscrow(e.target.checked)} /> Escrow changes by the same amount
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
      {h.runs.length ? (
        <ul className="mt-2 space-y-0.5 text-xs">
          {h.runs.map((r) => (
            <li key={r.from} className="tnum flex justify-between gap-3">
              <span className="text-muted">
                {monthLabel(r.from)} – {monthLabel(r.to)} · {r.months.length} payments
              </span>
              <span className="font-semibold">{formatCents(r.cents)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">No three payments in a row were about the same: it varies month to month.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {h.runs.length ? (
          <button type="button" disabled={pending} className="font-semibold text-accent-text hover:underline disabled:opacity-60" onClick={() => start(async () => setNote(await matchPastToPaymentsAction(h.id)))}>
            Set past budgets to what was paid
          </button>
        ) : null}
        {note ? <span className={note.ok ? "text-ok" : "text-danger"}>{note.message}</span> : null}
      </div>
    </details>
  );
}
