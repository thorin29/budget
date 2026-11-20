"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { recordActualAction } from "./actions";
import { formatCents, toDecimalString } from "@/lib/money";
import { describeDifference, parseQuickQuery, rankMatches } from "@/lib/quick-entry";
import { buttonClass } from "@/components/ui";
import { shortDate, type RowEntry } from "./row-model";
import { Icon } from "@/components/icons";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Type an item and an amount, review, confirm. Two presses of Enter, never
 * one: the first shows exactly what will be recorded, the second records it.
 */
export function QuickEntry({ rows, today }: { rows: RowEntry[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  // Null until edited: follows the chosen item's own default date.
  const [paidOnEdit, setPaidOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Unpaid first, soonest due first, so the likeliest item is on top.
  const ordered = useMemo(
    () =>
      rows.slice().sort((a, b) => {
        const pa = a.actualCents === null ? 0 : 1;
        const pb = b.actualCents === null ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      }),
    [rows],
  );

  const parsed = parseQuickQuery(query);
  const matches = parsed.words
    ? rankMatches(ordered, parsed.words).slice(0, 7)
    : ordered.filter((r) => r.actualCents === null).slice(0, 6);
  const target = matches[Math.min(selected, matches.length - 1)] ?? null;
  const ready = target !== null && parsed.amountCents !== null;
  const paidOn = paidOnEdit ?? target?.defaultPaidOn ?? today;

  const reset = useCallback(() => {
    setQuery("");
    setSelected(0);
    setReviewing(false);
    setError(null);
    setPaidOn(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (reviewing) confirmRef.current?.focus();
  }, [reviewing]);

  const confirm = () => {
    if (!target || parsed.amountCents === null) return;
    const form = new FormData();
    form.set("lineItemId", target.lineItemId);
    form.set("year", String(target.year));
    form.set("month", String(target.month));
    form.set("amount", toDecimalString(parsed.amountCents));
    form.set("paidOn", paidOn);

    startSaving(async () => {
      const result = await recordActualAction({ ok: true }, form);
      if (result.ok) close();
      else {
        setError(result.message ?? "Could not record that");
        setReviewing(false);
      }
    });
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
      setReviewing(false);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
      setReviewing(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!target) return;
      if (parsed.amountCents === null) {
        // No amount yet: fill in the budget so it can be accepted or edited.
        setQuery(`${target.name} ${toDecimalString(target.budgetedCents)}`);
        setSelected(0);
        return;
      }
      setReviewing(true);
    }
  };

  return (
    <>
      {/* No button: rows are recorded in place. ⌘K / Ctrl+K still opens this for keyboard entry. */}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[12vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (reviewing) {
                setReviewing(false);
                inputRef.current?.focus();
              } else close();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qe-title"
            className="w-full max-w-[640px] overflow-hidden rounded-[20px] bg-surface shadow-pop"
          >
            <h2 id="qe-title" className="sr-only">
              Record a payment
            </h2>

            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Icon name="magnifying-glass" size={22} className="shrink-0 text-subtle" />
              <label htmlFor="qe" className="sr-only">
                Item and amount
              </label>
              <input
                id="qe"
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                  setReviewing(false);
                  setError(null);
                }}
                onKeyDown={onInputKey}
                placeholder="Type an item, then the amount — e.g. electric 172.40"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-subtle"
              />
              <kbd className="rounded-md border border-line px-2 py-0.5 text-xs text-neutral">Esc</kbd>
            </div>

            {error ? <p className="mx-5 mt-4 text-sm text-danger">{error}</p> : null}

            {ready && target ? (
              <div
                className={`mx-5 mt-4 rounded-[14px] bg-accent-soft p-4 transition ${
                  reviewing ? "ring-2 ring-accent" : ""
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
                    <Icon name="check" size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-accent-ink">
                      Record <strong>{formatCents(parsed.amountCents as number)}</strong> for {target.name}
                    </p>
                    <p className="tnum mt-0.5 text-[13px] text-accent-ink/80">
                      {MONTH_NAMES[target.month - 1]}
                      {target.status === "carried" ? ` ${target.year} (carried)` : ""} ·{" "}
                      {describeDifference(parsed.amountCents as number, target.budgetedCents, formatCents)}
                      {target.actualCents !== null ? ` · replaces ${formatCents(target.actualCents)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 pl-[54px]">
                  <label className="flex items-center gap-2 text-[13px] font-medium text-accent-ink">
                    {target.kind === "INCOME" ? "Received on" : "Paid on"}
                    <input
                      type="date"
                      value={paidOn}
                      onChange={(e) => setPaidOn(e.target.value)}
                      className="rounded-lg border border-accent/30 bg-surface px-2 py-1 text-sm text-foreground"
                    />
                  </label>
                  <span className="flex-1" />
                  <button
                    ref={confirmRef}
                    type="button"
                    onClick={confirm}
                    disabled={saving}
                    className={buttonClass("primary")}
                  >
                    {saving ? "Saving…" : reviewing ? "Confirm — press ↵" : "Confirm"}
                  </button>
                </div>
              </div>
            ) : null}

            <p className="mx-5 mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral">
              {parsed.words ? (matches.length ? "Matches" : "No match") : "Unpaid this month"}
            </p>
            <div role="listbox" aria-label="Matching items" className="max-h-80 overflow-y-auto px-2.5 pb-2.5">
              {matches.map((m, i) => {
                const isSelected = m === target;
                return (
                  <div
                    key={`${m.lineItemId}-${m.year}-${m.month}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSelected(i);
                      setReviewing(false);
                      if (parsed.amountCents === null) {
                        setQuery(`${m.name} ${toDecimalString(m.budgetedCents)}`);
                        setSelected(0);
                      }
                      inputRef.current?.focus();
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 ${
                      isSelected ? "bg-neutral-soft" : "hover:bg-sunken"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        m.actualCents !== null
                          ? "bg-accent"
                          : m.status === "overdue" || m.status === "carried"
                            ? "bg-danger"
                            : "border-2 border-line-strong"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {[
                          m.dueDate ? `Due ${shortDate(m.dueDate)}` : null,
                          m.categoryName,
                          m.actualCents !== null
                            ? `paid ${formatCents(m.actualCents)}`
                            : m.status === "overdue" || m.status === "carried"
                              ? "overdue"
                              : "unpaid",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="tnum text-sm text-neutral">{formatCents(m.budgetedCents)}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line bg-sunken px-5 py-3 text-xs text-neutral">
              <span>
                <strong className="text-foreground">↑ ↓</strong> choose
              </span>
              <span>
                <strong className="text-foreground">↵</strong> review, then{" "}
                <strong className="text-foreground">↵</strong> again to confirm
              </span>
              <span>
                <strong className="text-foreground">Esc</strong> back
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
