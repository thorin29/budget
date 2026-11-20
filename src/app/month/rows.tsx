"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  adjustMonthAction,
  clearActualAction,
  moveActualAction,
  recordActualAction,
  recordBalanceAction,
  type FormState,
} from "./actions";
import { formatCents, toDecimalString } from "@/lib/money";
import { describeDifference, tryParseCents } from "@/lib/quick-entry";
import { Pill, ProgressBar, TextInput, buttonClass, type PillTone } from "@/components/ui";
import { shortDate, shortMonth, type RowEntry } from "./row-model";
import { Icon } from "@/components/icons";

const INITIAL: FormState = { ok: true };

// ---------------------------------------------------------------- list

export interface MonthSection {
  key: string;
  title: string;
  /** Right-hand summary, e.g. "$420.00 of $1,180.00 paid". */
  summary: string;
  rows: RowEntry[];
  progress?: { value: number; max: number; tone?: "accent" | "info" };
  tone?: "danger";
  note?: string;
}

type Filter = "all" | "unpaid" | "paid";

const isSettled = (r: RowEntry) => r.actualCents !== null;

export function MonthList({
  sections,
  footer,
}: {
  sections: MonthSection[];
  footer: { paidCents: number; budgetedCents: number; also?: Array<[string, number]> };
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = {
    all: sections.reduce((n, s) => n + s.rows.length, 0),
    unpaid: sections.reduce((n, s) => n + s.rows.filter((r) => !isSettled(r)).length, 0),
    paid: sections.reduce((n, s) => n + s.rows.filter(isSettled).length, 0),
  };

  const keep = (r: RowEntry) =>
    filter === "all" ? true : filter === "paid" ? isSettled(r) : !isSettled(r);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-base font-bold">Bills &amp; Income</h2>
        <div className="inline-flex rounded-[10px] bg-neutral-soft p-1 text-sm" role="tablist">
          {(["all", "unpaid", "paid"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1 font-medium capitalize transition ${
                filter === f ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground"
              }`}
            >
              {f} <span className="tnum text-subtle">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {sections.map((section) => {
        const rows = section.rows.filter(keep);
        return (
          <section
            key={section.key}
            className={section.tone === "danger" ? "bg-danger-soft/40" : ""}
          >
            <div className="border-b border-line bg-sunken px-5 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3
                  className={`font-sans text-[13px] font-semibold uppercase tracking-wide ${
                    section.tone === "danger" ? "text-danger" : "text-neutral"
                  }`}
                >
                  {section.title}
                </h3>
                <p className="tnum text-xs text-muted">{section.summary}</p>
              </div>
              {section.progress ? (
                <ProgressBar
                  className="mt-2"
                  value={section.progress.value}
                  max={section.progress.max}
                  tone={section.progress.tone}
                />
              ) : null}
              {section.note ? <p className="mt-1.5 text-xs text-muted">{section.note}</p> : null}
            </div>

            {rows.length === 0 ? (
              <p className="border-b border-line px-5 py-4 text-center text-sm text-subtle">
                {section.rows.length === 0 ? "Nothing in this half." : `Nothing ${filter} here.`}
              </p>
            ) : (
              rows.map((row) => (
                <EntryRow key={`${row.lineItemId}-${row.year}-${row.month}`} row={row} />
              ))
            )}
          </section>
        );
      })}

      <div className="tnum px-5 py-3.5 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <span className="font-semibold">Bills this month</span>
          <span>
            <strong>{formatCents(footer.paidCents)}</strong>
            <span className="text-muted"> paid of {formatCents(footer.budgetedCents)}</span>
          </span>
        </div>
        {footer.also?.some(([, c]) => c > 0) ? (
          <p className="mt-1 text-xs text-muted">
            Not in this total:{" "}
            {footer.also
              .filter(([, c]) => c > 0)
              .map(([label, c]) => `${label} ${formatCents(c)}`)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- row

function statusPill(row: RowEntry): { tone: PillTone; label: string } {
  switch (row.status) {
    case "paid":
      return { tone: "ok", label: `${row.paidOn ? `Paid ${shortDate(row.paidOn)}` : "Paid"}${row.autoPaid ? " · auto" : ""}` };
    case "received":
      return { tone: "ok", label: `${row.paidOn ? `Received ${shortDate(row.paidOn)}` : "Received"}${row.autoPaid ? " · auto" : ""}` };
    case "expected":
      return { tone: "info", label: "Expected" };
    case "carried":
      return { tone: "danger", label: `Unpaid from ${shortMonth(row.month)}` };
    case "overdue":
      return { tone: "danger", label: "Overdue" };
    case "soon":
      return {
        tone: "warn",
        label:
          row.daysUntilDue === 0
            ? "Due today"
            : row.daysUntilDue === 1
              ? "Due tomorrow"
              : `Due in ${row.daysUntilDue} days`,
      };
    default:
      return { tone: "neutral", label: "Upcoming" };
  }
}

function StatusDot({ row }: { row: RowEntry }) {
  if (row.actualCents !== null) {
    return (
      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
        <Icon name="check" size={12} />
      </span>
    );
  }
  const late = row.status === "overdue" || row.status === "carried";
  return (
    <span
      aria-hidden
      className={`h-5 w-5 shrink-0 rounded-full border-2 border-dashed ${late ? "border-danger" : "border-line-strong"}`}
    />
  );
}

export function EntryRow({ row }: { row: RowEntry }) {
  const [open, setOpen] = useState(false);
  const pill = statusPill(row);
  const paid = row.actualCents !== null;

  const meta = [
    row.dueDate ? `${row.kind === "INCOME" ? "Arrives" : "Due"} ${shortDate(row.dueDate)}` : null,
    row.accountName,
    row.categoryName,
    row.adjusted ? "budget adjusted" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`border-b border-line last:border-b-0 ${open ? "bg-sunken" : ""}`}>
      <div className="flex items-center gap-3 px-5 py-3">
        <StatusDot row={row} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{row.name}</p>
          {meta ? <p className="mt-0.5 truncate text-xs text-muted">{meta}</p> : null}
          {!paid && row.suggestion ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok hover:brightness-95"
            >
              {row.kind === "INCOME" ? "Looks received" : "Looks paid"} · {formatCents(row.suggestion.amountCents)} on{" "}
              {shortDate(row.suggestion.postedOn)} · Confirm
            </button>
          ) : null}
        </div>

        <span className="hidden sm:inline-flex">
          <Pill tone={pill.tone}>{pill.label}</Pill>
        </span>

        <span className="tnum hidden w-24 shrink-0 text-right text-sm text-muted md:block">
          {formatCents(row.budgetedCents)}
        </span>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${paid ? "Change" : "Add"} amount for ${row.name}`}
          className={`tnum w-28 shrink-0 rounded-[10px] px-2.5 py-1.5 text-right text-sm transition ${
            paid
              ? "font-semibold hover:bg-neutral-soft"
              : "border border-dashed border-line-strong text-muted hover:border-accent hover:text-accent-text"
          } ${open ? "ring-2 ring-accent/40" : ""}`}
        >
          {paid ? formatCents(row.actualCents as number) : "Add amount"}
        </button>
      </div>

      {open ? <EntryPanel row={row} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

/**
 * The only way a payment is recorded: type or accept the amount, then press
 * Confirm. There is deliberately no one-tap tick — a stray click must never
 * mark a bill as paid.
 */
function EntryPanel({ row, onClose }: { row: RowEntry; onClose: () => void }) {
  const [payState, pay, paying] = useActionState(recordActualAction, INITIAL);
  const [clearState, clear, clearing] = useActionState(clearActualAction, INITIAL);
  const [adjustState, adjust, adjusting] = useActionState(adjustMonthAction, INITIAL);
  const [moveState, move, moving] = useActionState(moveActualAction, INITIAL);
  const suggested = row.actualCents === null ? row.suggestion ?? null : null;
  const [amount, setAmount] = useState(
    toDecimalString(row.actualCents ?? suggested?.amountCents ?? row.budgetedCents),
  );
  const [more, setMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const income = row.kind === "INCOME";
  const paid = row.actualCents !== null;
  const cents = tryParseCents(amount);

  // Close once a save lands. Each submission yields a fresh state object.
  const lastPay = useRef(payState);
  const lastClear = useRef(clearState);
  const lastAdjust = useRef(adjustState);
  const lastMove = useRef(moveState);
  useEffect(() => {
    const changed =
      payState !== lastPay.current || clearState !== lastClear.current || adjustState !== lastAdjust.current || moveState !== lastMove.current;
    lastPay.current = payState;
    lastClear.current = clearState;
    lastAdjust.current = adjustState;
    lastMove.current = moveState;
    if (changed && payState.ok && clearState.ok && adjustState.ok && moveState.ok) onClose();
  }, [payState, clearState, adjustState, moveState, onClose]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const error = [payState, clearState, adjustState, moveState].find((s) => !s.ok)?.message;
  // Nearby months a late or early payment could really belong to.
  const otherMonths = [-3, -2, -1, 1].map((by) => {
    const n = row.year * 12 + (row.month - 1) + by;
    return { year: Math.floor(n / 12), month: (n % 12) + 1 };
  });

  const hidden = (
    <>
      <input type="hidden" name="lineItemId" value={row.lineItemId} />
      <input type="hidden" name="year" value={row.year} />
      <input type="hidden" name="month" value={row.month} />
    </>
  );
  const fromBank = suggested ? <input type="hidden" name="bankTransactionId" value={suggested.txnId} /> : null;

  return (
    <div
      className="px-5 pb-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <form
        action={pay}
        className="rounded-xl border border-line bg-surface p-4 shadow-card"
      >
        {hidden}
        {fromBank}
        {suggested ? (
          <p className="mb-3 text-xs text-muted">
            From the bank: {suggested.merchant} · {suggested.account} · {shortDate(suggested.postedOn)}. Change anything before
            confirming.
          </p>
        ) : null}
        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
        {paid && row.bankLinked ? (
          <p className="mb-3 text-xs text-muted">
            Tied to a bank charge. Marking it unpaid keeps that charge from being used for this item again; if it was
            for another month, choose the month and Move.
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="w-40">
            <span className="mb-1.5 block text-[13px] font-semibold">
              {income ? "Amount received" : "Amount paid"}
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">$</span>
              <TextInput
                ref={inputRef}
                name="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tnum pl-6 text-base font-semibold"
                required
              />
            </div>
          </label>

          <label className="w-44">
            <span className="mb-1.5 block text-[13px] font-semibold">
              {income ? "Received on" : "Paid on"}
            </span>
            <TextInput type="date" name="paidOn" defaultValue={suggested?.postedOn ?? row.defaultPaidOn} />
          </label>

          <p className="tnum min-w-0 flex-1 pb-2 text-sm text-muted">
            {cents === null
              ? "Enter an amount"
              : `${income ? "Expected" : "Budget"} ${formatCents(row.budgetedCents)} · ${describeDifference(
                  cents,
                  row.budgetedCents,
                  formatCents,
                )}`}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="text-sm font-medium text-muted hover:text-foreground"
          >
            {more ? "Fewer options" : "More options"}
          </button>
          {row.paymentUrl ? (
            <a
              href={row.paymentUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-sm font-medium text-info hover:underline"
            >
              Open payment page ↗
            </a>
          ) : null}

          <span className="flex-1" />

          {paid ? (
            <span className="flex items-center gap-1.5">
              <select
                name="toPeriod"
                aria-label="Month this payment was for"
                defaultValue=""
                className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  Was for…
                </option>
                {otherMonths.map((m) => (
                  <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                    {shortMonth(m.month)} {m.year}
                  </option>
                ))}
              </select>
              <button type="submit" formAction={move} formNoValidate disabled={moving} className={buttonClass("quiet")}>
                Move
              </button>
            </span>
          ) : null}
          {paid ? (
            <button
              type="submit"
              formAction={clear}
              formNoValidate
              disabled={clearing}
              className={buttonClass("danger")}
            >
              {income ? "Mark not received" : "Mark unpaid"}
            </button>
          ) : null}
          <button type="button" onClick={onClose} className={buttonClass("quiet")}>
            Cancel
          </button>
          <button type="submit" disabled={paying || cents === null} className={buttonClass("primary")}>
            {paying ? "Saving…" : cents === null ? "Confirm" : `Confirm ${formatCents(cents)}`}
          </button>
        </div>
      </form>

      {more ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-line-strong p-4">
          <form action={adjust} className="flex items-end gap-2">
            {hidden}
            <label className="w-44">
              <span className="mb-1.5 block text-[13px] font-semibold">This month&rsquo;s budget</span>
              <TextInput
                name="amount"
                inputMode="decimal"
                defaultValue={toDecimalString(row.budgetedCents)}
                placeholder="Empty uses the plan"
                className="tnum"
              />
            </label>
            <button type="submit" disabled={adjusting} className={buttonClass("quiet")}>
              Set
            </button>
          </form>

          <p className="pb-2 text-xs text-muted">
            Usual amount {formatCents(row.plannedCents)}
            {row.adjusted ? " — this month differs" : ""}
          </p>

          <span className="flex-1" />

          {!paid ? (
            <form action={adjust}>
              {hidden}
              <input type="hidden" name="skipped" value="true" />
              <button type="submit" disabled={adjusting} className={buttonClass("quiet")}>
                Nothing due this month
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- balance

export function BalanceCard({
  year,
  month,
  accountName,
  balanceCents,
  carriedFrom,
  fromBank = null,
}: {
  year: number;
  month: number;
  accountName: string | null;
  balanceCents: number | null;
  /** Set when the balance comes from the bank feed: when it was last updated. */
  fromBank?: string | null;
  /** Set when the figure shown was entered in an earlier month. */
  carriedFrom: { year: number; month: number } | null;
}) {
  const [state, action, pending] = useActionState(recordBalanceAction, INITIAL);
  const [editing, setEditing] = useState(balanceCents === null);
  const [value, setValue] = useState(balanceCents === null ? "" : toDecimalString(balanceCents));

  const last = useRef(state);
  useEffect(() => {
    if (state !== last.current && state.ok) setEditing(false);
    last.current = state;
  }, [state]);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <p className="text-[13px] font-medium text-muted">{accountName ?? "Bills account"} balance</p>

      {editing ? (
        <form action={action} className="mt-1.5">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">$</span>
              <TextInput
                name="amount"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="tnum pl-6 text-base font-semibold"
                autoFocus={balanceCents !== null}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && balanceCents !== null) setEditing(false);
                }}
                required
              />
            </div>
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending ? "…" : "Save"}
            </button>
          </div>
          {state.ok ? null : <p className="mt-2 text-xs text-danger">{state.message}</p>}
        </form>
      ) : (
        <>
          <p className="tnum font-heading mt-1.5 text-[26px] font-bold leading-tight tracking-tight">
            {formatCents(balanceCents ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {fromBank ? (
              `From the bank · ${fromBank}`
            ) : (
              <>
                {carriedFrom ? `Last entered in ${shortMonth(carriedFrom.month)} ${carriedFrom.year} · ` : ""}
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="font-semibold text-accent-text hover:underline"
                >
                  Update
                </button>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
