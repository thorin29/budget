"use client";

/**
 * The Accounts editor: always on screen, showing the account clicked in the list (the first one
 * when the page opens). Everything is saved together with Save; Undo changes puts the form back.
 * Clicking another account with unsaved changes asks first.
 */

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CARD_COLORS, cardColor, isCustomColor } from "@/lib/card-colors";
import { saveAccountAction, setAccountHiddenAction, type AccountEdit } from "../bank-actions";

let dirty = false;

/** A row in the accounts list: a link that asks before dropping unsaved changes. */
export function RowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      onClick={(e) => {
        if (dirty && !window.confirm("Leave without saving your changes to this account?")) e.preventDefault();
        else dirty = false;
      }}
    >
      {children}
    </Link>
  );
}

export interface EditorAccount {
  id: string;
  displayName: string;
  feedName: string;
  institution: string | null;
  nickname: string | null;
  type: string;
  hidden: boolean;
  spending: boolean;
  closeDay: number | null;
  dueDay: number | null;
  promoEndsOn: string | null;
  color: string | null;
  isBillsSource: boolean;
  cyclePlan: boolean;
}

const field = "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm";

export function AccountEditor({ a, types }: { a: EditorAccount; types: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  const start0: AccountEdit = {
    nickname: a.nickname ?? "",
    type: a.type,
    closeDay: a.closeDay ? String(a.closeDay) : "",
    dueDay: a.dueDay ? String(a.dueDay) : "",
    promoEndsOn: a.promoEndsOn ?? "",
    color: a.color ?? "",
    billsSource: a.isBillsSource,
    cyclePlan: a.cyclePlan,
  };
  const [v, setV] = useState<AccountEdit>(start0);
  const [note, setNote] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = JSON.stringify(v) !== JSON.stringify(start0);
  useEffect(() => {
    dirty = changed;
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  const set = (patch: Partial<AccountEdit>) => {
    setV((x) => ({ ...x, ...patch }));
    setNote(null);
  };
  const preset = isCustomColor(v.color) ? "custom" : v.color;
  const card = v.type === "CREDIT_CARD";
  const cash = v.type === "CHECKING" || v.type === "SAVINGS";
  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveAccountAction(a.id, v);
          setNote(r);
          if (r.ok) {
            dirty = false;
            router.refresh();
          }
        });
      }}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Editing</p>
        <h2 className="text-xl font-bold">{v.nickname.trim() || a.feedName}</h2>
        <p className="text-xs text-muted">
          {a.institution ?? "Unknown institution"} · feed name “{a.feedName}”
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Name</span>
        <input value={v.nickname} maxLength={60} placeholder={a.feedName} onChange={(e) => set({ nickname: e.target.value })} className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Type</span>
          <select value={v.type} onChange={(e) => set({ type: e.target.value })} className={field}>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {card ? (
          <label className="block">
            <span className="mb-1 block text-xs text-muted">0% offer ends</span>
            <input type="date" value={v.promoEndsOn} onChange={(e) => set({ promoEndsOn: e.target.value })} className={field} />
          </label>
        ) : null}
        {card ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Statement closes on day</span>
              <input type="number" min={1} max={31} value={v.closeDay} onChange={(e) => set({ closeDay: e.target.value })} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Payment due on day</span>
              <input type="number" min={1} max={31} value={v.dueDay} onChange={(e) => set({ dueDay: e.target.value })} className={field} />
            </label>
          </>
        ) : null}
      </div>
      {card ? (
        <div className="text-sm">
          <span className="mb-1.5 block text-xs text-muted">Card color</span>
          <div className="flex flex-wrap items-center gap-2">
            {CARD_COLORS.map((c) => {
              const id = c.id === "graphite" ? "" : c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={preset === id}
                  onClick={() => set({ color: id })}
                  className={`h-6 w-9 rounded-md border border-line ${preset === id ? "ring-2 ring-accent ring-offset-2" : ""}`}
                  style={{ background: cardColor(c.id).background }}
                />
              );
            })}
            <label className={`flex h-6 items-center gap-1 rounded-md px-1 text-xs ${preset === "custom" ? "ring-2 ring-accent ring-offset-2" : ""}`}>
              <input type="color" aria-label="Pick exactly" value={isCustomColor(v.color) ? v.color : "#14563c"} onChange={(e) => set({ color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-line bg-surface p-0" />
              exact
            </label>
          </div>
        </div>
      ) : null}
      {card ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={v.cyclePlan} onChange={(e) => set({ cyclePlan: e.target.checked })} className="mt-0.5" />
          <span>Plan by statement cycle</span>
        </label>
      ) : null}
      {cash ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={v.billsSource} onChange={(e) => set({ billsSource: e.target.checked })} className="mt-0.5" />
          <span>
            Holds the bills money
            
          </span>
        </label>
      ) : null}
      <p className="border-t border-line pt-3 text-xs text-muted">{a.hidden ? "Hidden: ignored everywhere" : a.spending ? "Counts as spending · in net worth" : "In net worth only"}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || !changed} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={pending || !changed} onClick={() => (setV(start0), setNote(null))} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-neutral-soft disabled:opacity-50">
          Undo changes
        </button>
        {note ? <span className={`text-xs ${note.ok ? "text-ok" : "text-danger"}`}>{note.message}</span> : null}
        <button
          type="button"
          disabled={pending}
          className="ml-auto text-sm font-semibold text-muted hover:text-foreground"
          title={a.hidden ? "Count it again" : "Ignored everywhere: not spending, not net worth, no transfer matching"}
          onClick={() => start(async () => { const r = await setAccountHiddenAction(a.id, !a.hidden); setNote(r); if (r.ok) router.refresh(); })}
        >
          {a.hidden ? "Show account" : "Hide account"}
        </button>
      </div>
    </form>
  );
}
