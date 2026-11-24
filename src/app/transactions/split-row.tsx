"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { newCategoryForSplitAction, setSplitCategoryAction } from "./actions";
import type { CategoryOption } from "./category-cell";

export interface SplitPart {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  amountCents: number;
  note: string | null;
}

const money = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

export interface BudgetGroup {
  id: string;
  name: string;
}

const NEW = "__new";

/**
 * A charge split by item (an Amazon order): its category, or how many it's split across, and a
 * row under it with each item when opened. Changing an item's category also changes it for the
 * same item everywhere, now and in later syncs. The items sit in their own full-width row so
 * opening one never moves the columns.
 */
export function SplitRow({ cells, amount, parts, categories, groups }: { cells: ReactNode; amount: ReactNode; parts: SplitPart[]; categories: CategoryOption[]; groups: BudgetGroup[] }) {
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
                <Part key={p.id} part={p} categories={categories} groups={groups} />
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function Part({ part, categories, groups }: { part: SplitPart; categories: CategoryOption[]; groups: BudgetGroup[] }) {
  const [value, setValue] = useState(part.categoryId ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [made, setMade] = useState<Array<{ id: string; name: string }>>([]);
  const create = () =>
    start(async () => {
      const r = await newCategoryForSplitAction(part.id, newName, newGroup === "none" ? null : newGroup);
      if (!r.ok) return setNote(r.message);
      setMade((m) => [...m, { id: r.categoryId!, name: r.name! }]);
      setValue(r.categoryId!);
      setAdding(false);
      setNewName("");
      setNote(r.others ? `Also changed ${r.others} more` : null);
    });
  const change = (next: string) => {
    if (next === NEW) return setAdding(true);
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
        {[...categories.filter((c) => !c.managedForOthers), ...made]
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        <option value={NEW}>New category…</option>
      </select>
      {adding ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="Name" aria-label="New category name" className="w-32 rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs" />
          <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)} aria-label="Budget" className="w-32 rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs">
            <option value="" disabled>
              Pick a budget
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="none">No budget yet</option>
          </select>
          <button type="button" disabled={pending || !newName.trim() || !newGroup} onClick={create} className="rounded-md bg-accent px-2 py-0.5 font-semibold text-on-accent">
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-muted">
            Cancel
          </button>
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-muted" title={part.note ?? ""}>
        {part.note}
      </span>
      {note ? <span className="shrink-0 text-muted">{note}</span> : null}
      <span className="tnum shrink-0">{money(part.amountCents)}</span>
    </li>
  );
}
