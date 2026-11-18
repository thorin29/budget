"use client";

import { useState, useTransition } from "react";
import { addRepeatAsSubscriptionAction, notASubscriptionAction, type EnvelopeState } from "../envelope-actions";

/** A repeating charge that isn't a bill yet: make it one, or stop listing it. */
export function RepeatActions({ merchantKey }: { merchantKey: string }) {
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  if (state?.ok) return <span className="shrink-0 text-xs text-ok">{state.message}</span>;
  return (
    <span className="flex shrink-0 items-center gap-3 text-xs font-semibold">
      <button type="button" disabled={pending} className="text-accent-text hover:underline" onClick={() => start(async () => setState(await addRepeatAsSubscriptionAction(merchantKey)))}>
        Make it a bill
      </button>
      <button type="button" disabled={pending} className="text-muted hover:underline" onClick={() => start(async () => setState(await notASubscriptionAction(merchantKey)))}>
        Not automatic
      </button>
      {state && !state.ok ? <span className="text-danger">{state.message}</span> : null}
    </span>
  );
}
