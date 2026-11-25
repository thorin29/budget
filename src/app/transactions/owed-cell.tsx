"use client";

import { useState, useTransition } from "react";
import { addPersonAction, setOwedAction } from "./actions";

export interface PersonOption {
  id: string;
  name: string;
}

const NEW = "__new";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Who owes you for a charge: "Owed · Sam $40.00", or "Someone owes me" to mark it. Their share
 * leaves your spending in the charge's month; their payment back goes in their category.
 */
export function OwedCell({ txnId, totalCents, owed, people }: { txnId: string; totalCents: number; owed: { personId: string; personName: string; cents: number } | null; people: PersonOption[] }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(people);
  const [person, setPerson] = useState(owed?.personId ?? "");
  const [newName, setNewName] = useState("");
  const [amount, setAmount] = useState(((owed?.cents ?? totalCents) / 100).toFixed(2));
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const save = (clear = false) =>
    start(async () => {
      setNote(null);
      let id = person;
      if (!clear && id === NEW) {
        const made = await addPersonAction(newName);
        if (!made.ok) return setNote(made.message);
        id = made.id!;
        setList((l) => [...l, { id, name: made.name! }].sort((a, b) => a.name.localeCompare(b.name)));
        setPerson(id);
      }
      const cents = Math.round(Number(amount.replace(/[$,]/g, "")) * 100);
      const r = await setOwedAction(txnId, clear ? null : id || null, clear ? null : cents);
      if (!r.ok) return setNote(r.message);
      setOpen(false);
    });

  if (!open)
    return (
      <span className="flex flex-col items-end">
        {owed ? (
          <button type="button" onClick={() => setOpen(true)} className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-text">
            Owed · {owed.personName} {money(owed.cents)}
          </button>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="whitespace-nowrap text-[11px] font-semibold text-accent-text opacity-0 hover:underline focus:opacity-100 group-hover:opacity-100">
            Someone owes me
          </button>
        )}
      </span>
    );

  return (
    <span className="flex flex-col items-end gap-1.5 text-xs">
      <span className="flex items-center gap-1.5">
        <select aria-label="Who owes you" value={person} onChange={(e) => setPerson(e.target.value)} className="w-32 rounded-md border border-line bg-surface px-1.5 py-0.5">
          <option value="" disabled>
            Who owes you
          </option>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW}>New person…</option>
        </select>
        {person === NEW ? <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="Name" aria-label="Name" className="w-24 rounded-md border border-line bg-surface px-1.5 py-0.5" /> : null}
      </span>
      <span className="flex items-center gap-1.5">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount they owe" className="tnum w-20 rounded-md border border-line bg-surface px-1.5 py-0.5 text-right" />
        <button type="button" onClick={() => setAmount((Math.round(totalCents / 2) / 100).toFixed(2))} className="text-accent-text">
          Half
        </button>
        <button type="button" onClick={() => setAmount((totalCents / 100).toFixed(2))} className="text-accent-text">
          All
        </button>
      </span>
      <span className="flex items-center gap-2">
        {owed ? (
          <button type="button" disabled={busy} onClick={() => save(true)} className="text-muted hover:text-foreground">
            Remove
          </button>
        ) : null}
        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
          Cancel
        </button>
        <button type="button" disabled={busy || !person || (person === NEW && !newName.trim())} onClick={() => save()} className="rounded-md bg-accent px-2 py-0.5 font-semibold text-on-accent">
          Save
        </button>
      </span>
      {note ? <span className="text-[11px] text-warn">{note}</span> : null}
    </span>
  );
}
