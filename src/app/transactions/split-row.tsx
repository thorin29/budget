"use client";

import { Fragment, useState, type ReactNode } from "react";

export interface SplitPart {
  categoryName: string | null;
  amountCents: number;
  note: string | null;
}

const money = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

/**
 * A charge split by item (an Amazon order): its category, or how many it's split across, and a
 * row under it with each part when opened. The parts sit in their own full-width row so opening
 * one never moves the columns.
 */
export function SplitRow({ cells, amount, parts }: { cells: ReactNode; amount: ReactNode; parts: SplitPart[] }) {
  const [open, setOpen] = useState(false);
  const names = [...new Set(parts.map((p) => p.categoryName ?? "No category"))];
  return (
    <Fragment>
      <tr>
        {cells}
        <td className="w-56 pr-3">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-line px-2 py-1 text-left text-xs hover:bg-neutral-soft">
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
            <ul className="space-y-0.5 text-xs">
              {parts.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-36 shrink-0 truncate font-semibold">{p.categoryName ?? "No category"}</span>
                  <span className="min-w-0 flex-1 truncate text-muted" title={p.note ?? ""}>{p.note}</span>
                  <span className="tnum shrink-0">{money(p.amountCents)}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
