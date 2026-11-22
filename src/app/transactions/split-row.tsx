"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { setSplitCategoryAction } from "./actions";
import type { CategoryOption } from "./category-cell";

export interface SplitPart {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  amountCents: number;
  note: string | null;
}

const money = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

/**
 * A charge split by item (an Amazon order): its category, or how many it's split across, and a
 * row under it with each item when opened. Changing an item's category also changes it for the
 * same item everywhere, now and in later syncs. The items sit in their own full-width row so
 * opening one never moves the columns.
 */
export function SplitRow({ cells, amount, parts, categories }: { cells: ReactNode; amount: ReactNode; parts: SplitPart[]; categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const missing = parts.filter((p) => !p.categoryId).length;
  const names = [...new Set(parts.map((p) => p.categoryName ?? "Needs a category"))];
  return (
    <Fragment>
      <tr>
        {cells}
        <td className="w-56 pr-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={`flex w-full items-center gap-1.5 overflow-hidden rounded-md border px-2 py-1 text-left text-xs hover:bg-neutral-soft ${missing ? "border-warn" : "border-line"}`}
          >
            <span className="truncate font-semibold">{names.length === 1 ? names[0] : `${names.length} categories`}</span>
            <span className="shrink-0 text-muted">· Amazon</span>
            <span className="ml-auto shrink-0 text-muted">{open ? "▴" : "▾"}</span>
          </button>
        </td>
        {amount}
      </tr>
      {open ? (
        <tr className="bg-neutral-soft/40">
          <td />
          <td colSpan={4} className="py-1.5 pr-4">
            <ul className="space-y-1 text-xs">
              {parts.map((p) => (
                <Part key={p.id} part={p} categories={categories} />
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function Part({ part, categories }: { part: SplitPart; categories: CategoryOption[] }) {
  const [value, setValue] = useState(part.categoryId ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const change = (next: string) => {
    const before = value;
    setValue(next);
    start(async () => {
      const r = await setSplitCategoryAction(part.id, next || null);
      if (!r.ok) {
        setValue(before);
        setNote(r.message);
      } else setNote(r.others ? `Also changed ${r.others} more` : null);
    });
  };
  return (
    <li className="flex items-center gap-3">
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        aria-label="Category for this item"
        className={`w-44 shrink-0 rounded-md border bg-surface px-1.5 py-0.5 text-xs ${value ? "border-line" : "border-warn"}`}
      >
        <option value="">Needs a category</option>
        {categories
          .filter((c) => !c.managedForOthers)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <span className="min-w-0 flex-1 truncate text-muted" title={part.note ?? ""}>
        {part.note}
      </span>
      {note ? <span className="shrink-0 text-muted">{note}</span> : null}
      <span className="tnum shrink-0">{money(part.amountCents)}</span>
    </li>
  );
}
