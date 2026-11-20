"use client";

/** Values you own that the bank doesn't send (a home, a car): edited here, counted in net worth. */

import { useState, useTransition } from "react";
import { saveOwnedAssetsAction, type EnvelopeState } from "../envelope-actions";

type Row = { id: string; name: string; amount: string };
const toRow = (a: { id: string; name: string; cents: number }): Row => ({ id: a.id, name: a.name, amount: String(Math.round(a.cents / 100)) });

export function AssetsForm({ assets }: { assets: Array<{ id: string; name: string; cents: number }> }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => (assets.length ? assets.map(toRow) : [{ id: "a1", name: "Home", amount: "" }]));
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-accent-text hover:underline">
        {assets.length ? "Edit values" : "Add a home, car or other value"}
      </button>
    );
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const save = () =>
    start(async () => {
      const list = rows
        .filter((r) => r.name.trim() && r.amount.trim())
        .map((r) => ({ id: r.id, name: r.name.trim(), cents: Math.round(Number(r.amount.replace(/[$,\s]/g, "")) * 100) }))
        .filter((r) => Number.isFinite(r.cents) && r.cents >= 0);
      const res = await saveOwnedAssetsAction(list);
      setState(res);
      if (res.ok) setOpen(false);
    });
  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-neutral-soft p-2.5">
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-2">
          <input aria-label="What it is" value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
          <input aria-label="Value in dollars" inputMode="decimal" placeholder="$" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} className="tnum w-28 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm" />
          <button type="button" aria-label={`Remove ${r.name || "row"}`} onClick={() => setRows((x) => x.filter((_, k) => k !== i))} className="text-sm text-muted hover:text-danger">
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-semibold">
        <button type="button" onClick={() => setRows((x) => [...x, { id: `a${Date.now()}`, name: "", amount: "" }])} className="text-accent-text hover:underline">
          + Add
        </button>
        <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-accent px-3 py-1 text-on-accent disabled:opacity-60">
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:underline">
          Cancel
        </button>
        {state && !state.ok ? <span className="text-danger">{state.message}</span> : null}
      </div>
    </div>
  );
}
