"use client";

import { useState, useTransition } from "react";
import { resetCategoryAction, setCategoryAction, setTransferAction } from "./actions";

export interface CategoryOption {
  id: string;
  name: string;
  managedForOthers: boolean;
}

const AUTO = "__auto";
const TRANSFER = "__transfer";

/**
 * Picks a transaction's category. Choosing one asks whether it's for this
 * transaction only or for everything from the merchant (which is remembered);
 * payment apps are always one at a time.
 */
export function CategoryCell({
  txn,
  categories,
}: {
  txn: { id: string; merchant: string; categoryId: string | null; categorySource: string; peer: boolean; transfer?: boolean };
  categories: CategoryOption[];
}) {
  const [value, setValue] = useState(txn.transfer ? TRANSFER : (txn.categoryId ?? ""));
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const personSet = txn.categorySource === "person";

  const save = (categoryId: string | null, forMerchant: boolean) =>
    start(async () => {
      const r = await setCategoryAction(txn.id, categoryId, forMerchant);
      setPendingChoice(null);
      if (!r.ok) {
        setValue(txn.categoryId ?? "");
        setNote(r.message);
        return;
      }
      setNote(forMerchant ? (r.others ? `Saved. ${r.others} other${r.others === 1 ? "" : "s"} updated too.` : "Saved for this merchant.") : null);
    });

  const onChange = (next: string) => {
    setNote(null);
    // Money moving to another of your accounts (a loan payment, savings): not spending at all.
    if (next === TRANSFER || value === TRANSFER) {
      const on = next === TRANSFER;
      setValue(next);
      start(async () => {
        const r = await setTransferAction(txn.id, on);
        if (!r.ok) setNote(r.message);
        else if (!on && next && next !== AUTO) setPendingChoice(next);
      });
      return;
    }
    if (next === AUTO) {
      setValue("");
      start(async () => {
        const r = await resetCategoryAction(txn.id);
        if (!r.ok) setNote(r.message);
      });
      return;
    }
    setValue(next);
    if (txn.peer) save(next || null, false);
    else setPendingChoice(next);
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5">
        {!personSet && txn.categoryId && txn.categorySource === "guess" ? <span className="text-[11px] text-muted">guessed</span> : null}
        <select
          aria-label={`Category for ${txn.merchant}`}
          value={value}
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          className={`max-w-40 rounded-lg border border-line bg-surface px-2 py-1 text-xs ${value ? "" : "text-muted"}`}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.managedForOthers ? " (for others)" : ""}
            </option>
          ))}
          <option value={TRANSFER}>Transfer (not spending)</option>
          {personSet ? <option value={AUTO}>Automatic</option> : null}
        </select>
      </span>
      {pendingChoice !== null ? (
        <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
          <span className="text-muted">Apply to</span>
          <button type="button" disabled={busy} onClick={() => save(pendingChoice || null, false)} className="rounded-md border border-line px-2 py-0.5 font-semibold hover:bg-neutral-soft">
            This one
          </button>
          <button type="button" disabled={busy} onClick={() => save(pendingChoice || null, true)} className="max-w-48 truncate rounded-md bg-accent px-2 py-0.5 font-semibold text-on-accent">
            All from {txn.merchant}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingChoice(null);
              setValue(txn.categoryId ?? "");
            }}
            className="text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </span>
      ) : null}
      {note ? <span className="text-[11px] text-muted">{note}</span> : null}
    </span>
  );
}
