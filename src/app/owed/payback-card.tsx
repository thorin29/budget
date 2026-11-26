"use client";

import { useState, useTransition } from "react";
import { approvePaybackAction, dismissPaybackAction } from "../review/actions";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Review: a payment that adds up exactly to someone's charges, to approve or turn down. */
export function PaybackCard({ item }: { item: { personId: string; personName: string; txnId: string; postedOn: string; merchant: string; cents: number; chargeKeys: string[]; charges: Array<{ postedOn: string; merchant: string; cents: number }> } }) {
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setNote(r.message ?? "Something went wrong");
    });
  return (
    <li className="rounded-xl border border-line px-3 py-2.5 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <b>{item.personName}</b> <span className="text-muted">paid you back?</span>
        </span>
        <span className="tnum font-semibold text-ok">+{money(item.cents)}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {short(item.postedOn)} · {item.merchant} = {item.charges.map((c) => `${short(c.postedOn)} ${c.merchant} ${money(c.cents)}`).join(" + ")}
      </p>
      <div className="mt-2 flex items-center justify-end gap-3 text-xs">
        {note ? <span className="mr-auto text-warn">{note}</span> : null}
        <button type="button" disabled={busy} onClick={() => run(() => dismissPaybackAction(item.personId, item.txnId))} className="font-semibold text-muted hover:text-foreground">
          Not this
        </button>
        <button type="button" disabled={busy} onClick={() => run(() => approvePaybackAction(item.personId, item.txnId, item.chargeKeys))} className="rounded-md bg-accent px-2.5 py-1 font-semibold text-on-accent">
          Yes, link it
        </button>
      </div>
    </li>
  );
}
