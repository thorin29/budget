"use client";

/** Settings › Budgets: the month's two money rules (the unplanned reserve, where extra income goes). */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setExtraToDebtAction, setReserveAction } from "../../insights/envelope-actions";

const INPUT = "w-24 rounded-lg border border-line bg-surface px-2 py-1 text-sm";

export function BudgetRules({ reserveCents, extraToDebt, debtCents }: { reserveCents: number; extraToDebt: boolean; debtCents: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reserve, setReserve] = useState(reserveCents ? String(Math.round(reserveCents / 100)) : "");
  const [extra, setExtra] = useState(extraToDebt);
  const [note, setNote] = useState<string | null>(null);
  const save = (work: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await work();
      setNote(r.ok ? "Saved." : (r.message ?? "Couldn't save"));
      if (r.ok) router.refresh();
    });
  const toCents = (v: string) => (v.trim() ? Math.round(Number(v.replace(/[$,]/g, "")) * 100) : null);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-neutral-soft px-4 py-3 text-sm">
      <label className="flex items-center gap-2">
        <b>Unplanned reserve</b>
        <input
          aria-label="Unplanned reserve each month"
          className={INPUT}
          placeholder="$0"
          value={reserve}
          onChange={(e) => setReserve(e.target.value)}
          onBlur={() => save(() => setReserveAction(toCents(reserve)))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <span className="text-xs text-muted">a month, for medical, repairs and fees</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={extra} disabled={pending} onChange={(e) => (setExtra(e.target.checked), save(() => setExtraToDebtAction(e.target.checked)))} />
        <b>Bonuses and 3rd paychecks go to the 0% card</b>
        <span className="text-xs text-muted">budgets run on a normal month</span>
      </label>
      <span className="text-xs text-muted">
        0% card {debtCents ? `$${Math.round(debtCents / 100).toLocaleString("en-US")}/mo` : "payment"} ·{" "}
        <Link href="/settings/accounts" className="font-semibold text-accent-text hover:underline">
          change in Accounts
        </Link>
      </span>
      {pending ? <span className="text-xs text-muted">Saving…</span> : note ? <span className="text-xs text-ok">{note}</span> : null}
    </div>
  );
}
