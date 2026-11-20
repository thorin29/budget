"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { notALoanAction, type EnvelopeState } from "../envelope-actions";

/**
 * A bill that looks like a loan: its balance, rate and escrow are set in its form in Bills &
 * income (the one place); this only offers the way there, or to say it isn't a loan.
 */
export function LoanPrompt({ id }: { id: string }) {
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  if (state?.ok) return <span className="mt-1 block text-xs text-muted">{state.message}</span>;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
      <a href={`/line-items?edit=${encodeURIComponent(id)}`} className="font-semibold text-accent-text hover:underline">
        Set its balance and rate in Bills &amp; income →
      </a>
      <Button type="button" variant="quiet" disabled={pending} onClick={() => start(async () => setState(await notALoanAction(id)))}>
        Not a loan
      </Button>
      {state && !state.ok ? <span className="text-danger">{state.message}</span> : null}
    </span>
  );
}
