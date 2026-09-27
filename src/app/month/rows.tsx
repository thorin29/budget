"use client";

import { useActionState, useState } from "react";
import {
  adjustMonthAction,
  clearActualAction,
  recordActualAction,
  recordBalanceAction,
  type FormState,
} from "./actions";
import { formatCents } from "@/lib/money";
import { Button, TextInput } from "@/components/ui";

const INITIAL: FormState = { ok: true };

export interface EntryProps {
  year: number;
  month: number;
  lineItemId: string;
  name: string;
  categoryName: string | null;
  accountName: string | null;
  paymentUrl: string | null;
  dueDay: number | null;
  budgetedCents: number;
  plannedCents: number;
  actualCents: number | null;
  adjusted: boolean;
  carriedFrom: { year: number; month: number } | null;
  budgetedDisplay: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function EntryRow(props: EntryProps) {
  const [open, setOpen] = useState(false);
  const paid = props.actualCents !== null;

  return (
    <div className={`border-t border-line first:border-t-0 ${paid ? "bg-accent-soft/40" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group -mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-accent-soft"
        >
          <span
            aria-hidden
            className={`shrink-0 text-xs text-muted transition-transform ${
              open ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          <span className="min-w-0">
          <span className="text-sm font-medium">{props.name}</span>
          <span className="ml-2 text-xs text-muted">
            {[
              props.dueDay ? `day ${props.dueDay}` : null,
              props.accountName,
              props.adjusted ? "adjusted" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {props.carriedFrom ? (
            <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] text-danger">
              unpaid from {MONTH_NAMES[props.carriedFrom.month - 1].slice(0, 3)}{" "}
              {props.carriedFrom.year}
            </span>
          ) : null}
          </span>
          <span className="ml-auto shrink-0 pl-2 text-xs text-muted opacity-0 transition group-hover:opacity-100">
            {open ? "close" : paid ? "edit" : "settle"}
          </span>
        </button>

        <span className="tnum w-24 shrink-0 text-right text-sm text-muted">
          {formatCents(props.budgetedCents)}
        </span>
        <span
          className={`tnum w-24 shrink-0 text-right text-sm ${paid ? "" : "text-muted/40"}`}
        >
          {paid ? formatCents(props.actualCents as number) : "—"}
        </span>
      </div>

      {open ? <EntryEditor {...props} /> : null}
    </div>
  );
}

function EntryEditor(props: EntryProps) {
  const [payState, pay, paying] = useActionState(recordActualAction, INITIAL);
  const [clearState, clear, clearing] = useActionState(clearActualAction, INITIAL);
  const [adjustState, adjust, adjusting] = useActionState(adjustMonthAction, INITIAL);

  const error = [payState, clearState, adjustState].find((s) => !s.ok)?.message;

  return (
    <div className="border-t border-line bg-background/60 px-4 py-4">
      {error ? <p className="mb-3 text-xs text-danger">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <form action={pay} className="flex items-end gap-2">
          <input type="hidden" name="lineItemId" value={props.lineItemId} />
          <input type="hidden" name="year" value={props.year} />
          <input type="hidden" name="month" value={props.month} />
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium">
              {props.actualCents === null ? "Record what was paid" : "Change what was paid"}
            </span>
            <TextInput
              name="amount"
              inputMode="decimal"
              defaultValue={
                props.actualCents === null ? props.budgetedDisplay : undefined
              }
              placeholder={props.budgetedDisplay}
              required
            />
          </label>
          <Button type="submit" disabled={paying}>
            {paying ? "…" : "Save"}
          </Button>
        </form>

        <form action={adjust} className="flex items-end gap-2">
          <input type="hidden" name="lineItemId" value={props.lineItemId} />
          <input type="hidden" name="year" value={props.year} />
          <input type="hidden" name="month" value={props.month} />
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium">
              Budget for this month only
            </span>
            <TextInput
              name="amount"
              inputMode="decimal"
              defaultValue={props.budgetedDisplay}
              placeholder="Leave empty to use the plan"
            />
          </label>
          <Button type="submit" variant="quiet" disabled={adjusting}>
            {adjusting ? "…" : "Set"}
          </Button>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="text-muted">
          Plan is {formatCents(props.plannedCents)}
          {props.adjusted ? " — this month differs" : ""}
        </span>

        {props.actualCents !== null ? (
          <form action={clear}>
            <input type="hidden" name="lineItemId" value={props.lineItemId} />
            <input type="hidden" name="year" value={props.year} />
            <input type="hidden" name="month" value={props.month} />
            <button
              type="submit"
              disabled={clearing}
              className="text-danger hover:underline"
            >
              Mark unpaid
            </button>
          </form>
        ) : null}

        <form action={adjust}>
          <input type="hidden" name="lineItemId" value={props.lineItemId} />
          <input type="hidden" name="year" value={props.year} />
          <input type="hidden" name="month" value={props.month} />
          <input type="hidden" name="skipped" value="true" />
          <button
            type="submit"
            disabled={adjusting}
            className="rounded-md border border-line px-2 py-1 hover:bg-accent-soft"
          >
            Nothing due this month
          </button>
        </form>

        {props.paymentUrl ? (
          <a
            href={props.paymentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            Pay
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** "1234.5" -> "$1,234.50". Returns the input unchanged if it is not a number. */
function asCurrency(raw: string): string {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return "";
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return raw;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function BalanceForm({
  year,
  month,
  accountName,
  defaultValue,
}: {
  year: number;
  month: number;
  accountName: string | null;
  defaultValue: string;
}) {
  const [state, action, pending] = useActionState(recordBalanceAction, INITIAL);
  // Held in state so a failed save does not discard what was typed.
  const [value, setValue] = useState(asCurrency(defaultValue));

  return (
    <div>
      <form action={action}>
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />

        <label className="block">
          <span className="mb-1 block text-xs font-medium">
            Currently in {accountName ?? "bills"}
          </span>
          <TextInput
            name="amount"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            // Formatted when idle; stripped back to digits while editing, so
            // the separators never get in the way of typing.
            onFocus={(e) => setValue(e.target.value.replace(/[$,\s]/g, ""))}
            onBlur={(e) => setValue(asCurrency(e.target.value))}
            className="tnum text-lg"
            required
          />
        </label>

        <Button type="submit" disabled={pending} className="mt-2 w-full">
          {pending ? "Saving…" : "Update"}
        </Button>
      </form>

      {state.ok ? null : (
        <p className="mt-2 text-xs text-danger">{state.message}</p>
      )}
    </div>
  );
}
