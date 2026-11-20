"use client";

/**
 * What's recorded against this line (so it's clear whether deleting it loses anything), and for
 * the same bill entered twice, a way to move this line's history into the other one.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { monthLabel } from "./amount-history";
import { mergeLineItemAction, type AmountState } from "./actions";

export interface LineHistory {
  payments: number;
  paidCents: number;
  firstPaid: string | null;
  lastPaid: string | null;
  plannedMonths: number;
  firstPlanned: string | null;
  lastPlanned: string | null;
}

const span = (a: string | null, b: string | null) => (a && b ? (a === b ? monthLabel(a) : `${monthLabel(a)} – ${monthLabel(b)}`) : "");

export function HistoryBox({ id, name, history, others, back }: { id: string; name: string; history: LineHistory; others: Array<{ id: string; name: string; active: boolean }>; back: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [into, setInto] = useState("");
  const [note, setNote] = useState<AmountState | null>(null);
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s*\(\d+\)$/, "");
  // Lines with the same name first: the likely duplicate.
  const sorted = [...others].sort((a, b) => Number(norm(b.name) === norm(name)) - Number(norm(a.name) === norm(name)) || a.name.localeCompare(b.name));
  const twin = sorted.find((o) => norm(o.name) === norm(name));
  const empty = history.payments === 0 && history.plannedMonths === 0;
  return (
    <div className="rounded-xl border border-line px-3 py-2.5 text-sm">
      <p className="text-xs font-semibold text-muted">Recorded on this line</p>
      {empty ? (
        <p className="mt-1 text-xs">Nothing: no payments and no months with their own amount. Deleting it loses nothing.</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs">
          {history.payments ? (
            <li>
              <b>{history.payments}</b> {history.payments === 1 ? "payment" : "payments"} ({formatCents(history.paidCents)}) · {span(history.firstPaid, history.lastPaid)}
            </li>
          ) : (
            <li>No payments</li>
          )}
          {history.plannedMonths ? (
            <li>
              <b>{history.plannedMonths}</b> {history.plannedMonths === 1 ? "month" : "months"} with their own amount · {span(history.firstPlanned, history.lastPlanned)}
            </li>
          ) : null}
        </ul>
      )}
      {!empty && sorted.length ? (
        <div className="mt-2 border-t border-line pt-2">
          <p className="text-xs text-muted">{twin ? `"${twin.name}" has the same name. ` : ""}Same bill twice? Move this line&rsquo;s history into the other one and delete this line.</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select aria-label="Move history into" value={into} onChange={(e) => setInto(e.target.value)} className="max-w-64 rounded-lg border border-line bg-surface px-2 py-1 text-sm">
              <option value="">Move into…</option>
              {sorted.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !into}
              className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:bg-neutral-soft disabled:opacity-60"
              onClick={() =>
                start(async () => {
                  const r = await mergeLineItemAction(id, into);
                  setNote(r);
                  if (r.ok) router.push(`${back}${back.includes("?") ? "&" : "?"}merged=${encodeURIComponent(r.message ?? "")}`);
                })
              }
            >
              Merge and delete this line
            </button>
          </div>
          {note && !note.ok ? <p className="mt-1 text-xs text-danger">{note.message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
