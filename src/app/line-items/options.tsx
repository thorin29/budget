"use client";

/** Bills & Income › Options: the bills account, how far ahead to look, how long unpaid bills carry. */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBillOptionsAction } from "../setup/actions";

const FIELD = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";

export function BillOptions({ accounts, billsAccountId, horizonDays, carryMonths }: { accounts: Array<{ id: string; name: string }>; billsAccountId: string | null; horizonDays: number; carryMonths: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [acct, setAcct] = useState(billsAccountId ?? "");
  const [days, setDays] = useState(String(horizonDays));
  const [carry, setCarry] = useState(String(carryMonths));
  const [note, setNote] = useState<{ ok: boolean; message?: string } | null>(null);
  return (
    <details className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <summary className="cursor-pointer text-sm font-semibold">Options</summary>
      <div className="mt-3 flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Bills account</span>
          <select value={acct} onChange={(e) => setAcct(e.target.value)} className={FIELD}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Look ahead (days)</span>
          <input type="number" min={7} max={365} value={days} onChange={(e) => setDays(e.target.value)} className={`${FIELD} w-24`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Carry unpaid bills for</span>
          <select value={carry} onChange={(e) => setCarry(e.target.value)} className={FIELD}>
            {[["0", "Not at all"], ["1", "1 month"], ["2", "2 months"], ["3", "3 months"], ["6", "6 months"], ["12", "12 months"]].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-on-accent disabled:opacity-60"
          onClick={() =>
            start(async () => {
              const r = await saveBillOptionsAction(acct || null, Number(days), Number(carry));
              setNote(r.ok ? { ok: true, message: "Saved." } : r);
              if (r.ok) router.refresh();
            })
          }
        >
          Save
        </button>
        {note ? <span className={`text-xs ${note.ok ? "text-ok" : "text-danger"}`}>{note.message}</span> : null}
      </div>
    </details>
  );
}
