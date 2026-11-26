"use client";

import { useState, useTransition } from "react";
import type { OwedPerson } from "@/server/owed";
import { approvePaybackAction, dismissPaybackAction, unlinkPaybackAction } from "../review/actions";

const money = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** One person on Owed to You: open charges to tick, payments that match, and what's paid. */
export function PersonCard({ person }: { person: OwedPerson }) {
  const open = person.charges.filter((c) => c.coveredCents < c.cents);
  const paid = person.charges.filter((c) => c.coveredCents >= c.cents);
  const [ticked, setTicked] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      if (!r.ok) setNote(r.message ?? "Something went wrong");
      else after?.();
    });
  const tickedCents = open.filter((c) => ticked.includes(c.key)).reduce((t, c) => t + (c.cents - c.coveredCents), 0);
  const payments = [...person.matches, ...person.maybe];
  const exact = payments.find((m) => m.cents === tickedCents);
  const link = (txnId: string, keys: string[]) => run(() => approvePaybackAction(person.id, txnId, keys), () => setTicked([]));

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h2 className="text-base font-bold">{person.name}</h2>
        <span className="tnum text-xl font-extrabold">{person.openCents < 0 ? `${money(-person.openCents)} ahead` : money(person.openCents)}</span>
      </div>
      <p className="tnum px-5 text-xs text-muted">
        {money(person.markedCents)} owed · {money(person.paidCents)} paid back
      </p>
      <div className="mt-3 grid grid-cols-1 border-t border-line md:grid-cols-2">
        <div className="px-5 py-3">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Open Charges</h3>
          {!open.length ? <p className="py-1 text-sm text-muted">Nothing open.</p> : null}
          <ul className="divide-y divide-dashed divide-line text-sm">
            {open.map((c) => (
              <li key={c.key}>
                <label className="flex cursor-pointer items-center gap-2.5 py-2">
                  <input type="checkbox" checked={ticked.includes(c.key)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, c.key] : t.filter((k) => k !== c.key)))} className="size-4 accent-[var(--color-accent)]" />
                  <span className="min-w-0 flex-1 truncate">
                    {short(c.postedOn)} · {c.merchant}
                    {c.categoryName ? <span className="text-muted"> · {c.categoryName}</span> : null}
                  </span>
                  <span className="tnum whitespace-nowrap">
                    {c.coveredCents ? <span className="mr-1.5 text-xs text-muted">{money(c.cents - c.coveredCents)} left of</span> : null}
                    {money(c.cents)}
                  </span>
                </label>
              </li>
            ))}
            {paid.slice(-6).reverse().map((c) => (
              <li key={c.key} className="tnum flex justify-between gap-3 py-2 text-muted line-through">
                <span className="truncate">
                  {short(c.postedOn)} · {c.merchant}
                </span>
                <span>{money(c.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-line bg-neutral-soft/30 px-5 py-3 md:border-l">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Payments That Match</h3>
          {!person.matches.length ? <p className="py-1 text-sm text-muted">None right now.</p> : null}
          <ul className="divide-y divide-dashed divide-line text-sm">
            {person.matches.map((m) => (
              <li key={m.txnId} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <b className="tnum block truncate">
                    {short(m.postedOn)} · {m.merchant} · +{money(m.cents)}
                  </b>
                  <span className="block truncate text-xs text-muted">
                    adds up to {person.charges.filter((c) => m.chargeKeys.includes(c.key)).map((c) => `${short(c.postedOn)} ${c.merchant}`).join(" and ")}
                  </span>
                </span>
                <button type="button" disabled={busy} onClick={() => run(() => dismissPaybackAction(person.id, m.txnId))} className="text-xs font-semibold text-muted hover:text-foreground">
                  Not this
                </button>
                <button type="button" disabled={busy} onClick={() => link(m.txnId, m.chargeKeys)} className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">
                  Link
                </button>
              </li>
            ))}
          </ul>
          {person.paybacks.length ? (
            <>
              <h3 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-muted">Paid Back</h3>
              <ul className="divide-y divide-dashed divide-line text-sm">
                {[...person.paybacks].reverse().map((b) => (
                  <li key={b.txnId} className="flex items-center gap-3 py-2">
                    <span className="tnum min-w-0 flex-1 truncate text-ok">
                      {short(b.postedOn)} · {b.merchant} · +{money(b.cents)}
                    </span>
                    <button type="button" disabled={busy} onClick={() => run(() => unlinkPaybackAction(b.txnId))} className="text-xs font-semibold text-muted hover:text-foreground">
                      Unlink
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
      {ticked.length ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-accent-soft px-5 py-2.5 text-sm">
          <span className="tnum">
            Ticked: <b>{money(tickedCents)}</b>
          </span>
          <select value={pick || exact?.txnId || ""} onChange={(e) => setPick(e.target.value)} aria-label="Payment" className="ml-auto max-w-[22rem] rounded-md border border-line bg-surface px-2 py-1 text-xs">
            <option value="">Pick the payment…</option>
            {payments.map((m) => (
              <option key={m.txnId} value={m.txnId}>
                {short(m.postedOn)} · {m.merchant} · +{money(m.cents)}
                {m.cents === tickedCents ? " (exact)" : ""}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !(pick || exact)} onClick={() => link(pick || exact!.txnId, ticked)} className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">
            Link
          </button>
        </div>
      ) : null}
      {note ? <p className="border-t border-line px-5 py-2 text-xs text-warn">{note}</p> : null}
    </div>
  );
}
