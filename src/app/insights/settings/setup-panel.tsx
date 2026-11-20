"use client";

/**
 * Setup, as a list and a detail: budgets down the left by kind, the chosen one on the right (its
 * kind, limit, usual spending and categories). A bar on top holds the 0% debt payment, the
 * checking cushion, and an alert for categories without a budget. The home value from RentCast
 * is set up from the same list.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteGroupAction,
  refreshHomeValueAction,
  resetGroupsAction,
  saveGroupAction,
  saveHomeValueAction,
  setCategoryGroupAction,
  setCushionAction,
  setDebtPaymentAction,
  setLimitsAction,
  type EnvelopeState,
} from "../envelope-actions";

type Tier = "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED" | "BILLS";
export interface SetupBudget {
  id: string;
  name: string;
  tier: Tier;
  limitCents: number | null;
  usualCents: number | null;
  spentCents: number | null;
  categories: Array<{ id: string; name: string }>;
}
export interface SetupHome {
  address: string;
  hasKey: boolean;
  valueCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  fetchedAt: string | null;
  error: string | null;
}

const KINDS: Array<[Tier, string, string]> = [
  ["ESSENTIAL", "Essentials", "var(--series-3)"],
  ["FLEXIBLE", "Extras", "var(--series-4)"],
  ["UNPLANNED", "Unplanned", "var(--series-5)"],
  ["BILLS", "Paid as bills", "var(--series-1)"],
];
const KIND_BUTTON: Record<Tier, string> = { ESSENTIAL: "Essential", FLEXIBLE: "Extra", UNPLANNED: "Unplanned", BILLS: "Bills" };
const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const toCents = (text: string): number | null => {
  if (!text.trim()) return null;
  const n = Math.round(Number(text.replace(/[$,\s]/g, "")) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const INPUT = "rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm tnum";
const BTN = "rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-60";
const QUIET = "rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-neutral-soft disabled:opacity-60";

function Note({ state }: { state: EnvelopeState | null }) {
  return state ? <span className={`text-xs ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</span> : null;
}

export function SetupPanel({
  budgets,
  ungrouped,
  debt,
  cushionCents,
  home,
}: {
  budgets: SetupBudget[];
  ungrouped: Array<{ id: string; name: string }>;
  debt: { cents: number; automatic: boolean; targetCents: number | null };
  cushionCents: number;
  home: SetupHome | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, choose] = useState<string>(ungrouped.length ? "unsorted" : (budgets[0]?.id ?? "new"));
  const [state, setState] = useState<EnvelopeState | null>(null);
  // A new pick starts without the last one's message.
  const setSel = (id: string) => {
    choose(id);
    setState(null);
  };
  const act = (work: () => Promise<EnvelopeState>) =>
    start(async () => {
      const r = await work();
      setState(r);
      if (r.ok) router.refresh();
    });

  const current = budgets.find((b) => b.id === sel) ?? null;
  return (
    <div className="space-y-4">
      <TopBar debt={debt} cushionCents={cushionCents} ungrouped={ungrouped.length} onUnsorted={() => setSel("unsorted")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <nav className="rounded-2xl border border-line bg-surface p-3 shadow-card" aria-label="Budgets">
          {KINDS.map(([tier, label, color]) => {
            const list = budgets.filter((b) => b.tier === tier);
            if (!list.length) return null;
            return (
              <div key={tier} className="mb-2">
                <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
                {list.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setSel(b.id);
                      setState(null);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${sel === b.id ? "bg-accent-soft font-bold" : "hover:bg-neutral-soft"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
                      <span className="truncate">{b.name}</span>
                    </span>
                    <span className="tnum shrink-0 text-xs text-muted">{tier === "ESSENTIAL" || tier === "FLEXIBLE" ? (b.limitCents !== null ? money(b.limitCents) : "auto") : ""}</span>
                  </button>
                ))}
              </div>
            );
          })}
          <div className="mt-2 space-y-1 border-t border-line pt-2">
            <button type="button" onClick={() => setSel("new")} className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold text-accent-text ${sel === "new" ? "bg-accent-soft" : "hover:bg-neutral-soft"}`}>
              + New budget
            </button>
            <button type="button" onClick={() => setSel("home")} className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${sel === "home" ? "bg-accent-soft font-bold" : "hover:bg-neutral-soft"}`}>
              Home value <span className="text-xs text-muted">· RentCast</span>
            </button>
          </div>
        </nav>

        <section className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card">
          {current ? (
            <BudgetDetail key={current.id} b={current} budgets={budgets} pending={pending} act={act} state={state} />
          ) : sel === "unsorted" ? (
            <Unsorted ungrouped={ungrouped} budgets={budgets} pending={pending} act={act} state={state} />
          ) : sel === "home" ? (
            <HomeValue home={home} pending={pending} act={act} state={state} />
          ) : (
            <NewBudget pending={pending} act={act} state={state} />
          )}
        </section>
      </div>
    </div>
  );
}

function TopBar({ debt, cushionCents, ungrouped, onUnsorted }: { debt: { cents: number; automatic: boolean; targetCents: number | null }; cushionCents: number; ungrouped: number; onUnsorted: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState(debt.automatic ? "" : String(Math.round(debt.cents / 100)));
  const [c, setC] = useState(cushionCents ? String(Math.round(cushionCents / 100)) : "");
  const [state, setState] = useState<EnvelopeState | null>(null);
  const save = (work: () => Promise<EnvelopeState>) =>
    start(async () => {
      const r = await work();
      setState(r);
      if (r.ok) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface px-5 py-3 text-sm shadow-card">
      <label className="flex items-center gap-2">
        <b>0% debt payment</b>
        <input aria-label="0% debt payment each month" className={`${INPUT} w-24`} placeholder="auto" value={d} onChange={(e) => setD(e.target.value)} onBlur={() => d !== (debt.automatic ? "" : String(Math.round(debt.cents / 100))) && save(() => setDebtPaymentAction(toCents(d)))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        {debt.targetCents ? <span className="text-xs text-muted">{money(debt.targetCents)}/mo clears it in time</span> : null}
      </label>
      <label className="flex items-center gap-2">
        <b>Checking cushion</b>
        <input aria-label="Checking cushion" className={`${INPUT} w-24`} placeholder="$0" value={c} onChange={(e) => setC(e.target.value)} onBlur={() => c !== (cushionCents ? String(Math.round(cushionCents / 100)) : "") && save(() => setCushionAction(toCents(c)))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      </label>
      {pending ? <span className="text-xs text-muted">Saving…</span> : <Note state={state} />}
      {ungrouped ? (
        <button type="button" onClick={onUnsorted} className="ml-auto rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn">
          {ungrouped} categor{ungrouped === 1 ? "y needs" : "ies need"} a budget →
        </button>
      ) : null}
    </div>
  );
}

type Act = (work: () => Promise<EnvelopeState>) => void;

function BudgetDetail({ b, budgets, pending, act, state }: { b: SetupBudget; budgets: SetupBudget[]; pending: boolean; act: Act; state: EnvelopeState | null }) {
  const [name, setName] = useState(b.name);
  const [tier, setTier] = useState<Tier>(b.tier);
  const [limit, setLimit] = useState(b.limitCents !== null ? String(Math.round(b.limitCents / 100)) : "");
  const [confirm, setConfirm] = useState(false);
  const limited = tier === "ESSENTIAL" || tier === "FLEXIBLE";
  const others = budgets.filter((x) => x.id !== b.id).flatMap((x) => x.categories.map((c) => ({ ...c, from: x.name })));
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input aria-label="Budget name" value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-xl font-bold hover:border-line focus:border-line" />
        {confirm ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted">Its categories will need a budget.</span>
            <button type="button" disabled={pending} className="font-semibold text-danger" onClick={() => act(() => deleteGroupAction(b.id))}>
              Remove
            </button>
            <button type="button" className="text-muted" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="text-sm font-semibold text-danger" onClick={() => setConfirm(true)}>
            Remove budget
          </button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-1 text-xs text-muted">Kind</p>
          <div className="flex gap-0.5 rounded-lg bg-neutral-soft p-0.5 text-xs font-semibold">
            {(Object.keys(KIND_BUTTON) as Tier[]).map((t) => (
              <button key={t} type="button" onClick={() => setTier(t)} className={`flex-1 rounded-md px-2 py-1 ${tier === t ? "bg-surface shadow-card" : "text-muted"}`}>
                {KIND_BUTTON[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">Monthly limit</p>
          {limited ? (
            <span className="flex items-center gap-2">
              <input aria-label="Monthly limit" className={`${INPUT} w-28`} placeholder="auto" value={limit} onChange={(e) => setLimit(e.target.value)} />
              <span className="text-xs text-muted">blank = automatic</span>
            </span>
          ) : (
            <span className="text-sm text-muted">No limit for this kind</span>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">Usual, and this month</p>
          <p className="tnum text-sm">
            <b>{b.usualCents !== null ? money(b.usualCents) : "—"}</b>
            {b.spentCents !== null ? <span className="text-muted"> · {money(b.spentCents)} so far</span> : null}
          </p>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs text-muted">Categories in this budget</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {b.categories.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-neutral-soft px-2.5 py-0.5 text-xs">
              {c.name}
              <button type="button" aria-label={`Take ${c.name} out of ${b.name}`} disabled={pending} className="text-muted hover:text-danger" onClick={() => act(() => setCategoryGroupAction(c.id, null))}>
                ✕
              </button>
            </span>
          ))}
          <select
            aria-label="Add a category"
            className="rounded-full border border-dashed border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-accent-text"
            value=""
            disabled={pending}
            onChange={(e) => e.target.value && act(() => setCategoryGroupAction(e.target.value, b.id))}
          >
            <option value="">+ Add a category</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (from {c.from})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          className={BTN}
          onClick={() =>
            act(async () => {
              const r = await saveGroupAction({ id: b.id, name, tier });
              if (!r.ok || !limited) return r;
              return setLimitsAction({ [b.id]: toCents(limit) });
            })
          }
        >
          Save
        </button>
        <Note state={state} />
      </div>
    </div>
  );
}

function Unsorted({ ungrouped, budgets, pending, act, state }: { ungrouped: Array<{ id: string; name: string }>; budgets: SetupBudget[]; pending: boolean; act: Act; state: EnvelopeState | null }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">Categories without a budget</h2>
      {ungrouped.length ? (
        <ul className="divide-y divide-line text-sm">
          {ungrouped.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span>{c.name}</span>
              <select aria-label={`Budget for ${c.name}`} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm" value="" disabled={pending} onChange={(e) => e.target.value && act(() => setCategoryGroupAction(c.id, e.target.value))}>
                <option value="">Put it in…</option>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Every category has a budget.</p>
      )}
      <Note state={state} />
    </div>
  );
}

function NewBudget({ pending, act, state }: { pending: boolean; act: Act; state: EnvelopeState | null }) {
  const [name, setName] = useState("");
  const [tier, setTier] = useState<Tier>("FLEXIBLE");
  const [reset, setReset] = useState(false);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">New budget</h2>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-56 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
        <div className="flex gap-0.5 rounded-lg bg-neutral-soft p-0.5 text-xs font-semibold">
          {(Object.keys(KIND_BUTTON) as Tier[]).map((t) => (
            <button key={t} type="button" onClick={() => setTier(t)} className={`rounded-md px-2.5 py-1 ${tier === t ? "bg-surface shadow-card" : "text-muted"}`}>
              {KIND_BUTTON[t]}
            </button>
          ))}
        </div>
        <button type="button" disabled={pending || !name.trim()} className={BTN} onClick={() => act(() => saveGroupAction({ name, tier }))}>
          Add
        </button>
      </div>
      <p className="text-xs text-muted">Then pick it in the list to give it categories and a limit.</p>
      <Note state={state} />
      <div className="border-t border-line pt-4 text-xs text-muted">
        <p>
          <b>Essential</b>: needed every month (groceries, fuel). <b>Extra</b>: could do without. <b>Unplanned</b>: irregular costs, no limit (repairs, medical).{" "}
          <b>Bills</b>: paid through the bill list, not everyday spending.
        </p>
        {reset ? (
          <p className="mt-2">
            Every budget goes and the suggested set is made again from your categories; limits you set are cleared.{" "}
            <button type="button" disabled={pending} className="font-semibold text-danger" onClick={() => act(() => resetGroupsAction())}>
              Start over
            </button>{" "}
            <button type="button" className="font-semibold" onClick={() => setReset(false)}>
              Cancel
            </button>
          </p>
        ) : (
          <button type="button" className="mt-2 font-semibold text-accent-text hover:underline" onClick={() => setReset(true)}>
            Start over with the suggested budgets
          </button>
        )}
      </div>
    </div>
  );
}

function HomeValue({ home, pending, act, state }: { home: SetupHome | null; pending: boolean; act: Act; state: EnvelopeState | null }) {
  const [address, setAddress] = useState(home?.address ?? "");
  const [key, setKey] = useState("");
  const when = home?.fetchedAt ? new Date(home.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">Home value</h2>
        <p className="mt-1 text-sm text-muted">
          An estimate from RentCast by address, kept as the Home value in net worth and refreshed once a month. Needs a RentCast API key (free plan at rentcast.io).
        </p>
      </div>
      {home?.valueCents ? (
        <p className="rounded-xl bg-neutral-soft px-4 py-3 text-sm">
          <b className="tnum text-lg">{money(home.valueCents)}</b>
          {home.lowCents && home.highCents ? (
            <span className="tnum text-muted">
              {" "}
              · range {money(home.lowCents)}–{money(home.highCents)}
            </span>
          ) : null}
          {when ? <span className="text-muted"> · as of {when}</span> : null}
        </p>
      ) : null}
      {home?.error ? <p className="text-sm text-danger">Last lookup: {home.error}</p> : null}
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Address</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST 12345" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">RentCast API key {home?.hasKey ? "(saved; leave blank to keep it)" : ""}</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" placeholder={home?.hasKey ? "••••••••" : "Paste the key"} className="w-full rounded-lg border border-line bg-surface px-2 py-1.5" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !address.trim() || (!key.trim() && !home?.hasKey)} className={BTN} onClick={() => act(() => saveHomeValueAction(address, key || null))}>
          Save and look up
        </button>
        {home?.hasKey ? (
          <button type="button" disabled={pending} className={QUIET} onClick={() => act(() => refreshHomeValueAction())}>
            Look up again
          </button>
        ) : null}
        {pending ? <span className="text-xs text-muted">Asking RentCast…</span> : <Note state={state} />}
      </div>
    </div>
  );
}
