"use client";

import { useState, useTransition } from "react";
import { Button, CONTROL } from "@/components/ui";
import { notALoanAction, saveLoanDetailsAction, type EnvelopeState } from "../envelope-actions";

const cents = (text: string): number | null => {
  if (!text.trim()) return null;
  const n = Math.round(Number(text.replace(/[$,\s]/g, "")) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const bps = (text: string): number | null => {
  if (!text.trim()) return null;
  const n = Math.round(Number(text.replace(/[%\s]/g, "")) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The balance left and the interest rate, for a loan the app can't follow from the bank. */
export function LoanForm({ id, balance = true, initialApr, askNotLoan = false }: { id: string; balance?: boolean; initialApr?: number | null; askNotLoan?: boolean }) {
  const [owed, setOwed] = useState("");
  const [apr, setApr] = useState(initialApr ? String(initialApr / 100) : "");
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {balance ? (
        <span className="w-32">
          <input aria-label="Balance left" className={CONTROL} inputMode="decimal" placeholder="$ left to pay" value={owed} onChange={(e) => setOwed(e.target.value)} />
        </span>
      ) : null}
      <span className="w-28">
        <input aria-label="Interest rate (APR)" className={CONTROL} inputMode="decimal" placeholder="APR %" value={apr} onChange={(e) => setApr(e.target.value)} />
      </span>
      <Button type="button" disabled={pending || (balance && cents(owed) === null)} onClick={() => start(async () => setState(await saveLoanDetailsAction(id, balance ? cents(owed) : null, bps(apr))))}>
        Save
      </Button>
      {askNotLoan ? (
        <Button type="button" variant="quiet" disabled={pending} onClick={() => start(async () => setState(await notALoanAction(id)))}>
          Not a loan
        </Button>
      ) : null}
      {state ? <span className={`text-xs ${state.ok ? "text-muted" : "text-danger"}`}>{state.message}</span> : null}
    </div>
  );
}
