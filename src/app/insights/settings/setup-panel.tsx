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
  addPastHomeValueAction,
  clearHomeKeyAction,
  removeHomeHistoryAction,
  renameCategoryAction,
  deleteCategoryAction,
  deleteGroupAction,
  refreshHomeValueAction,
  resetGroupsAction,
  saveGroupAction,
  saveHomeEstimatesAction,
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
  keyFromEnv: boolean;
  keySaved: boolean;
  callsThisMonth: number;
  callsLimit: number;
  estimates: Array<{ source: string; cents: number; on: string }>;
  averageCents: number | null;
  usedCents: number | null;
  usedSources: string[];
  history: Array<{ source: string; cents: number; on: string; yearOnly?: boolean }>;
  address: string;
  hasKey: boolean;
  valueCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  fetchedAt: string | null;
  error: string | null;
  triedAt?: string | null;
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

export type Usage = Record<string, { count: number; cents: number; latest: Array<{ date: string; merchant: string; cents: number }> }>;

export function SetupPanel({
  budgets,
  ungrouped,
  usage,
  debt,
  cushionCents,
  home,
  initial,
}: {
  budgets: SetupBudget[];
  ungrouped: Array<{ id: string; name: string }>;
  usage: Usage;
  debt: { cents: number; automatic: boolean; targetCents: number | null };
  cushionCents: number;
  home: SetupHome | null;
  /** The item to open first (?item=home from the net worth card). */
  initial?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, choose] = useState<string>(initial === "home" ? "home" : ungrouped.length ? "unsorted" : (budgets[0]?.id ?? "new"));
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
            <button type="button" onClick={() => setSel("home")} className={`flex w-full justify-between rounded-lg px-2.5 py-1.5 text-left text-sm ${sel === "home" ? "bg-accent-soft font-bold" : "hover:bg-neutral-soft"}`}>
              <span>Home value</span>
              <span className="tnum text-xs text-muted">{home?.averageCents ? money(home.averageCents) : home?.valueCents ? money(home.valueCents) : ""}</span>
            </button>
          </div>
        </nav>

        <section className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card">
          {current ? (
            <BudgetDetail key={current.id} b={current} budgets={budgets} pending={pending} act={act} state={state} />
          ) : sel === "unsorted" ? (
            <Unsorted ungrouped={ungrouped} usage={usage} budgets={budgets} pending={pending} act={act} state={state} />
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
        <button type="button" onClick={onUnsorted} className="ml-auto rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn underline decoration-dotted underline-offset-2 hover:decoration-solid">
          {ungrouped} categor{ungrouped === 1 ? "y needs" : "ies need"} a budget: see {ungrouped === 1 ? "it" : "them"} →
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
        <p className="mb-1.5 text-xs text-muted">Categories in this budget · click a name to rename it</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {b.categories.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-neutral-soft px-2.5 py-0.5 text-xs">
              <CategoryName id={c.id} name={c.name} pending={pending} act={act} />
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

function Unsorted({ ungrouped, usage, budgets, pending, act, state }: { ungrouped: Array<{ id: string; name: string }>; usage: Usage; budgets: SetupBudget[]; pending: boolean; act: Act; state: EnvelopeState | null }) {
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const signed = (c: number) => `${c < 0 ? "−" : "+"}$${(Math.abs(c) / 100).toFixed(2)}`;
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">Categories without a budget</h2>
        <p className="mt-1 text-sm text-muted">A category exists but isn&rsquo;t in any budget, so its spending isn&rsquo;t counted against one. Put it in a budget, or remove it if it isn&rsquo;t used.</p>
      </div>
      {ungrouped.length ? (
        <ul className="divide-y divide-line text-sm">
          {ungrouped.map((c) => {
            const u = usage[c.id];
            return (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <CategoryName id={c.id} name={c.name} pending={pending} act={act} bold />
                  <span className="block text-xs text-muted">
                    {u && u.count ? (
                      <>
                        {u.count} transaction{u.count === 1 ? "" : "s"} in the last year ·{" "}
                        {u.latest.map((l) => `${day(l.date)} ${l.merchant} ${signed(l.cents)}`).join(" · ")} ·{" "}
                        <a href={`/transactions?category=${c.id}${u.latest[0] ? `&m=${u.latest[0].date.slice(0, 7)}` : ""}`} className="font-semibold text-accent-text hover:underline">
                          See them
                        </a>
                      </>
                    ) : (
                      "Not used by any transaction in the last year"
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <select aria-label={`Budget for ${c.name}`} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm" value="" disabled={pending} onChange={(e) => e.target.value && act(() => setCategoryGroupAction(c.id, e.target.value))}>
                    <option value="">Put it in…</option>
                    {budgets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={pending} className="text-xs font-semibold text-danger hover:underline" onClick={() => act(() => deleteCategoryAction(c.id))}>
                    Remove category
                  </button>
                </span>
              </li>
            );
          })}
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

/** A category's name that turns into a box when clicked: Enter or leaving it saves, Esc cancels. */
function CategoryName({ id, name, pending, act, bold = false }: { id: string; name: string; pending: boolean; act: Act; bold?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (!editing)
    return (
      <button type="button" title="Rename" disabled={pending} className={`text-left hover:underline ${bold ? "font-bold" : ""}`} onClick={() => setEditing(true)}>
        {name}
      </button>
    );
  const save = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== name) act(() => renameCategoryAction(id, value));
    else setValue(name);
  };
  return (
    <input
      aria-label={`New name for ${name}`}
      autoFocus
      value={value}
      maxLength={60}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") {
          setValue(name);
          setEditing(false);
        }
      }}
      className="w-36 rounded border border-line bg-surface px-1.5 py-0 text-xs"
    />
  );
}

/** Every value entered or looked up, newest first, with a form for one from the past (year, month optional). */
function PastValues({ home, pending, act, fmt }: { home: SetupHome | null; pending: boolean; act: Act; fmt: (d: string) => string }) {
  const thisYear = new Date().getFullYear();
  const [source, setSource] = useState("County appraisal");
  const [amount, setAmount] = useState("");
  const [year, setYear] = useState(String(thisYear - 1));
  const [month, setMonth] = useState("");
  const history = [...(home?.history ?? [])].sort((a, b) => b.on.localeCompare(a.on));
  const when = (h: { on: string; yearOnly?: boolean }) => (h.yearOnly ? h.on.slice(0, 4) : fmt(h.on));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (
    <details className="text-sm" open={history.length > 0 && history.length <= 6}>
      <summary className="cursor-pointer text-xs font-semibold text-accent-text">History{history.length ? ` (${history.length})` : ""} · add a past value</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <input aria-label="Where it's from" value={source} onChange={(e) => setSource(e.target.value)} className="w-40 rounded-lg border border-line bg-surface px-2 py-1" />
        <input aria-label="Value" inputMode="decimal" placeholder="$" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${INPUT} w-32 py-1`} />
        <select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1">
          {Array.from({ length: 15 }, (_, i) => thisYear - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select aria-label="Month (optional)" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1">
          <option value="">Month —</option>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !source.trim() || !(toCents(amount) ?? 0)}
          className={QUIET}
          onClick={() =>
            act(async () => {
              const r = await addPastHomeValueAction(source, toCents(amount) ?? 0, Number(year), month ? Number(month) : null);
              if (r.ok) setAmount("");
              return r;
            })
          }
        >
          Add
        </button>
      </div>
      {history.length ? (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted sm:max-w-md">
          {history.map((h) => (
            <li key={`${h.on}:${h.source}:${h.cents}`} className="tnum flex items-center justify-between gap-3">
              <span>
                {when(h)} · {h.source}
              </span>
              <span className="flex items-center gap-2">
                {money(h.cents)}
                <button type="button" aria-label={`Remove ${h.source} ${when(h)}`} disabled={pending} className="hover:text-danger" onClick={() => act(() => removeHomeHistoryAction(h))}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

function HomeValue({ home, pending, act, state }: { home: SetupHome | null; pending: boolean; act: Act; state: EnvelopeState | null }) {
  // Saved estimates first, then any of the usual sources not entered yet (so County appraisal
  // shows even after the others were saved).
  const saved = (home?.estimates ?? []).map((e) => ({ source: e.source, amount: String(Math.round(e.cents / 100)), on: e.on as string | undefined }));
  const start: Array<{ source: string; amount: string; on?: string }> = [
    ...saved,
    ...["Zillow", "Redfin", "Realtor.com", "County appraisal"].filter((s) => !saved.some((x) => x.source.toLowerCase() === s.toLowerCase())).map((source) => ({ source, amount: "" })),
  ];
  const [rows, setRows] = useState(start);
  const [address, setAddress] = useState(home?.address ?? "");
  const [key, setKey] = useState("");
  const nums = rows.map((r) => toCents(r.amount)).filter((c): c is number => c !== null && c > 0);
  const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  const set = (i: number, patch: Partial<{ source: string; amount: string }>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  // Sites update often; a county appraisal once a year.
  const yearly = (s: string) => /county|apprais|assess|cad\b|tax/i.test(s);
  const stale = (home?.estimates ?? []).some((e) => Date.now() - Date.parse(`${e.on}T00:00:00Z`) > (yearly(e.source) ? 395 : 90) * 86_400_000);
  // Where to look each one up, from the address: any address in the US works.
  const lookup = (source: string) => {
    const a = address.trim();
    if (!a) return null;
    const q = (s: string) => `https://www.google.com/search?q=${encodeURIComponent(s)}`;
    if (/zillow/i.test(source)) return `https://www.zillow.com/homes/${encodeURIComponent(a.replace(/,/g, ""))}_rb/`;
    if (/redfin/i.test(source)) return q(`${a} redfin estimate`);
    if (/realtor/i.test(source)) return q(`${a} realtor.com`);
    if (yearly(source)) {
      const place = a.split(",").slice(1).join(",").trim() || a;
      return q(`${place} county appraisal district property search`);
    }
    return q(`${a} ${source} home value`);
  };
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">Home value</h2>
        <p className="mt-1 text-sm text-muted">
          Type in the estimates from Zillow, Redfin, Realtor.com and your county&rsquo;s appraisal (the value on its yearly notice or its property search). Their average becomes the Home value in net worth. With the address filled in, &ldquo;Look up&rdquo; opens each one for your home.
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Address</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST 12345" className="w-full max-w-md rounded-lg border border-line bg-surface px-2 py-1.5" />
      </label>
      {stale ? <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">Some estimates are out of date (sites after three months, the county after a year): worth checking again.</p> : null}
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input aria-label="Source" value={r.source} onChange={(e) => set(i, { source: e.target.value })} className="w-40 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
            <input aria-label={`${r.source || "Source"} estimate`} inputMode="decimal" placeholder="$" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} className={`${INPUT} w-36 py-1.5`} />
            {lookup(r.source) ? (
              <a href={lookup(r.source)!} target="_blank" rel="noreferrer noopener" className="text-xs font-semibold text-accent-text hover:underline">
                Look up ↗
              </a>
            ) : null}
            {r.on ? <span className="text-xs text-muted">{fmt(r.on)}</span> : null}
            <button type="button" aria-label={`Remove ${r.source || "row"}`} className="text-sm text-muted hover:text-danger" onClick={() => setRows((x) => x.filter((_, k) => k !== i))}>
              ✕
            </button>
          </div>
        ))}
        {home?.valueCents ? (
          // Looked up, not typed: shown with the others so it's easy to find.
          <div className="flex items-center gap-2 text-sm">
            <span className="w-40 px-2">RentCast</span>
            <span className="tnum w-36 px-2 font-semibold">{money(home.valueCents)}</span>
            <span className="text-xs text-muted">
              {home.fetchedAt ? fmt(home.fetchedAt.slice(0, 10)) : ""} · looked up
              {home.lowCents && home.highCents ? ` · range ${money(home.lowCents)}–${money(home.highCents)}` : ""}
            </span>
          </div>
        ) : null}
        <button type="button" className="text-xs font-semibold text-accent-text hover:underline" onClick={() => setRows((x) => [...x, { source: "", amount: "" }])}>
          + Add a source
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          Average <b className="tnum">{avg !== null ? money(avg) : "—"}</b>
          {nums.length > 1 ? <span className="tnum text-xs text-muted"> · range {money(Math.min(...nums))}–{money(Math.max(...nums))}</span> : null}
        </span>
        <button
          type="button"
          disabled={pending}
          className={BTN}
          onClick={() => act(() => saveHomeEstimatesAction(rows.map((r) => ({ source: r.source, cents: toCents(r.amount) ?? 0 })).filter((r) => r.source.trim() && r.cents > 0), address))}
        >
          Save
        </button>
        <Note state={state} />
      </div>
      {home?.usedCents ? (
        <p className="rounded-xl bg-neutral-soft px-4 py-3 text-sm">
          Net worth uses <b className="tnum">{money(home.usedCents)}</b>
          <span className="text-muted">
            {" "}
            · {home.usedSources.length > 1 ? `average of ${home.usedSources.join(", ")}` : `from ${home.usedSources[0]}`}. Only current estimates count: a site&rsquo;s for 6 months, the county&rsquo;s for 15, RentCast&rsquo;s for 45 days; with none current, the newest one stands.
          </span>
        </p>
      ) : null}
      <PastValues home={home} pending={pending} act={act} fmt={fmt} />
      <details className="rounded-xl border border-line p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Or look it up automatically with RentCast</summary>
        <p className="mt-2 text-xs text-muted">
          Needs a RentCast API key. Best kept on the server as <code>RENTCAST_API_KEY</code>; pasting it here also works (stored encrypted). At most one lookup a month on its own, one a day by hand, and never more than {home?.callsLimit ?? 5} a month.
          {home ? ` ${home.callsThisMonth} used this month.` : ""} Its value joins the average with the others.
        </p>
        {home?.keyFromEnv ? <p className="mt-1 text-xs font-semibold text-ok">Key found in the server&rsquo;s environment.</p> : null}
        {home?.valueCents ? (
          <p className="tnum mt-2 text-xs">
            RentCast: <b>{money(home.valueCents)}</b>
            {home.lowCents && home.highCents ? ` (range ${money(home.lowCents)}–${money(home.highCents)})` : ""}
            {home.fetchedAt ? ` · ${new Date(home.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
          </p>
        ) : null}
        {home?.triedAt ? (
          <p className={`mt-1 text-xs ${home.error ? "text-danger" : "text-muted"}`}>
            Last tried {new Date(home.triedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            {home.error ? `: ${home.error}` : ": found a value"}
          </p>
        ) : home?.error ? (
          <p className="mt-1 text-xs text-danger">Last lookup: {home.error}</p>
        ) : null}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <span className="self-center text-xs text-muted">Uses the address above.</span>
          <input aria-label="RentCast API key" value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" placeholder={home?.keyFromEnv ? "Set on the server" : home?.hasKey ? "Key saved (blank keeps it)" : "API key"} className="rounded-lg border border-line bg-surface px-2 py-1.5" />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={pending || !address.trim() || (!key.trim() && !home?.hasKey)} className={QUIET} onClick={() => act(() => saveHomeValueAction(address, key || null))}>
            Save and look up
          </button>
          {home?.hasKey ? (
            <button type="button" disabled={pending} className={QUIET} onClick={() => act(() => refreshHomeValueAction())}>
              Look up again
            </button>
          ) : null}
          {home?.keySaved ? (
            <button type="button" disabled={pending} className="text-xs font-semibold text-danger hover:underline" onClick={() => act(() => clearHomeKeyAction())}>
              {home.keyFromEnv ? "Remove the key saved here (the server\u2019s is used)" : "Remove saved key"}
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
