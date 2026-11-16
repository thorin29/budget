"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, ErrorBanner, Select, TextInput } from "@/components/ui";
import { formatCents, toDecimalString } from "@/lib/money";
import { addRepeatAction, confirmMatchAction, dismissMatchAction, dismissRepeatAction, dueDayAction, undoAutoAction, type ReviewState } from "./actions";
import type { LooksPaid, RepeatCharge } from "@/server/review";

const INITIAL: ReviewState = { ok: true };
const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const monthName = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

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
            {monthName(item.year, item.month)} · {income ? "expected" : "planned"} {formatCents(item.budgetedCents)}
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
          {item.openMonths.length > 1 ? null : (
            <input type="hidden" name="period" value={`${item.year}-${item.month}`} />
          )}
          <input type="hidden" name="txnId" value={item.txnId} />
          <div className="flex flex-wrap items-end gap-3">
            {item.openMonths.length > 1 ? (
              <label className="w-40 text-[13px] font-semibold">
                For
                <Select name="period" defaultValue={`${item.year}-${item.month}`} className="mt-1">
                  {item.openMonths.map((m) => (
                    <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                      {monthName(m.year, m.month)}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
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

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** A payment the bank feed recorded on its own, with Undo. */
export function AutoRecordedRow({ item }: { item: { lineItemId: string; year: number; month: number; name: string; amountCents: number; paidOn: string | null; merchant: string | null } }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<ReviewState | null>(null);
  if (result?.ok) return <li className="px-4 py-3 text-sm text-muted">{result.message}</li>;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="min-w-0">
        <span className="font-semibold">{item.name}</span> <span className="text-muted">for {monthName(item.year, item.month)}</span>
        <span className="block truncate text-xs text-muted">
          {formatCents(item.amountCents)}
          {item.paidOn ? ` on ${short(item.paidOn)}` : ""}
          {item.merchant ? ` · ${item.merchant}` : ""}
        </span>
        {result && !result.ok ? <span className="text-xs text-danger">{result.message}</span> : null}
      </span>
      <Button type="button" variant="quiet" disabled={busy} onClick={() => start(async () => setResult(await undoAutoAction(item.lineItemId, item.year, item.month)))}>
        Undo
      </Button>
    </li>
  );
}

/** A due day the bank moved, with Keep and Put back. */
export function DueDayRow({ item }: { item: { lineItemId: string; name: string; from: number | null; to: number | null } }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<ReviewState | null>(null);
  if (result?.ok) return <li className="px-4 py-3 text-sm text-muted">{result.message}</li>;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <span>
        <span className="font-semibold">{item.name}</span> now due the {item.to ? ordinal(item.to) : "—"}
        <span className="block text-xs text-muted">Was the {item.from ? ordinal(item.from) : "unset"} · it has been posting around the {item.to ? ordinal(item.to) : "—"}</span>
        {result && !result.ok ? <span className="text-xs text-danger">{result.message}</span> : null}
      </span>
      <span className="flex gap-2">
        <Button type="button" variant="quiet" disabled={busy} onClick={() => start(async () => setResult(await dueDayAction(item.lineItemId, true)))}>
          Keep
        </Button>
        <Button type="button" variant="quiet" disabled={busy} onClick={() => start(async () => setResult(await dueDayAction(item.lineItemId, false)))}>
          Put back
        </Button>
      </span>
    </li>
  );
}
