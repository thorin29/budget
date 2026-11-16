"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, ErrorBanner, TextInput } from "@/components/ui";
import { formatCents, toDecimalString } from "@/lib/money";
import { addRepeatAction, confirmMatchAction, dismissMatchAction, dismissRepeatAction, type ReviewState } from "./actions";
import type { LooksPaid, RepeatCharge } from "@/server/review";

const INITIAL: ReviewState = { ok: true };
const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * A suggestion never records on one tap: "Review and record" opens the amount
 * and date, and Confirm records them.
 */
export function LooksPaidCard({ item }: { item: LooksPaid }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(confirmMatchAction, INITIAL);
  const [busy, start] = useTransition();
  const [gone, setGone] = useState(false);
  const income = item.kind === "INCOME";
  if (gone || (state.ok && state.message)) return null;

  return (
    <li className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-ok">
            {income ? "Looks received" : "Looks paid"} · {item.reason}
          </p>
          <p className="mt-1 text-base font-semibold">{item.billName}</p>
          <p className="text-sm text-muted">
            {income ? "Expected" : "Planned"} {formatCents(item.budgetedCents)}
            {item.dueDay ? ` · due the ${item.dueDay}` : ""}
          </p>
        </div>
        <p className="tnum text-xl font-bold">{formatCents(item.amountCents)}</p>
      </div>
      <p className="mt-3 truncate rounded-lg bg-neutral-soft px-3 py-2 text-xs text-muted">
        {item.account} · {short(item.postedOn)} · {item.description}
      </p>

      {!open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={() => setOpen(true)}>
            Review and record
          </Button>
          <Button
            type="button"
            variant="quiet"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await dismissMatchAction(item.lineItemId, item.txnId);
                if (r.ok) setGone(true);
              })
            }
          >
            Not this
          </Button>
        </div>
      ) : (
        <form action={submit} className="mt-3 rounded-xl border border-line p-3">
          {!state.ok ? <ErrorBanner message={state.message} /> : null}
          <input type="hidden" name="lineItemId" value={item.lineItemId} />
          <input type="hidden" name="year" value={item.year} />
          <input type="hidden" name="month" value={item.month} />
          <input type="hidden" name="txnId" value={item.txnId} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="w-36 text-[13px] font-semibold">
              {income ? "Amount received" : "Amount paid"}
              <TextInput name="amount" inputMode="decimal" defaultValue={toDecimalString(item.amountCents)} className="mt-1" />
            </label>
            <label className="w-44 text-[13px] font-semibold">
              Date
              <TextInput type="date" name="paidOn" defaultValue={item.postedOn} className="mt-1" />
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Confirm"}
            </Button>
            <button type="button" onClick={() => setOpen(false)} className="pb-2 text-sm text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

export function RepeatCard({ item }: { item: RepeatCharge }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<ReviewState | null>(null);
  if (result?.ok) return <li className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{result.message ?? "Done."}</li>;

  return (
    <li className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-warn">Repeats every month</p>
          <p className="mt-1 text-base font-semibold">{item.merchant}</p>
          <p className="text-sm text-muted">
            {item.months} months running · around the {item.typicalDay} · {item.account} · not a bill yet
          </p>
        </div>
        <p className="tnum text-xl font-bold">{formatCents(item.typicalCents)}</p>
      </div>
      {result && !result.ok ? (
        <div className="mt-3">
          <ErrorBanner message={result.message} />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => start(async () => setResult(await addRepeatAction(item.merchantKey)))}>
          Add as a monthly bill
        </Button>
        <Button type="button" variant="quiet" disabled={busy} onClick={() => start(async () => setResult(await dismissRepeatAction(item.merchantKey)))}>
          Not a bill
        </Button>
      </div>
    </li>
  );
}
