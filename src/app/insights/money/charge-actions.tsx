"use client";

/**
 * What to do with a charge that may be a bill: link it to a bill already on the list (best
 * guesses first; it pays the right month and never records a bill twice), add it as a new
 * bill, or say it isn't a bill and give it an everyday category.
 */

import { useState, useTransition } from "react";
import { addChargeAsBillAction, matchChargeToBillAction, type EnvelopeState } from "../envelope-actions";
import { setCategoryAction } from "@/app/transactions/actions";

export interface BillChoice {
  id: string;
  name: string;
  /** YYYY-MM for a past-due month carried into this one. */
  ym: string | null;
  suggested: boolean;
}

export interface CategoryChoice {
  id: string;
  name: string;
  group: string;
}

const SELECT = "max-w-[14rem] rounded-lg border border-line bg-surface px-2 py-1 text-xs";

export function ChargeActions({ txnId, bills, categories }: { txnId: string; bills: BillChoice[]; categories: CategoryChoice[] }) {
  const [mode, setMode] = useState<"" | "link" | "not">("");
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  if (state?.ok) return <span className="shrink-0 text-xs text-ok">{state.message}</span>;
  const groups = [...new Set(categories.map((c) => c.group))];
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs font-semibold">
      {mode === "link" ? (
        <select
          aria-label="Bill this charge pays"
          className={SELECT}
          disabled={pending}
          defaultValue=""
          onChange={(e) => {
            const b = bills.find((x) => `${x.id}|${x.ym ?? ""}` === e.target.value);
            if (b) start(async () => setState(await matchChargeToBillAction(txnId, b.id, b.ym)));
          }}
        >
          <option value="" disabled>
            Pick the bill…
          </option>
          {bills.map((b) => (
            <option key={`${b.id}|${b.ym ?? ""}`} value={`${b.id}|${b.ym ?? ""}`}>
              {b.suggested ? "★ " : ""}
              {b.name}
            </option>
          ))}
        </select>
      ) : mode === "not" ? (
        <select
          aria-label="Category for this charge"
          className={SELECT}
          disabled={pending}
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            if (id)
              start(async () => {
                const r = await setCategoryAction(txnId, id, true);
                setState(r.ok ? { ok: true, message: "Moved to everyday spending" } : { ok: false, message: r.message });
              });
          }}
        >
          <option value="" disabled>
            Its category…
          </option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {categories
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      ) : (
        <>
          <button type="button" className="text-accent-text hover:underline" onClick={() => setMode("link")}>
            Link to a bill
          </button>
          <button type="button" disabled={pending} className="text-accent-text hover:underline" onClick={() => start(async () => setState(await addChargeAsBillAction(txnId)))}>
            New bill
          </button>
          <button type="button" className="text-muted hover:underline" onClick={() => setMode("not")}>
            Not a bill
          </button>
        </>
      )}
      {mode ? (
        <button type="button" className="text-muted hover:underline" onClick={() => setMode("")}>
          Cancel
        </button>
      ) : null}
      {state && !state.ok ? <span className="text-danger">{state.message}</span> : null}
    </span>
  );
}
