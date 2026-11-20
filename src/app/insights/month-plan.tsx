"use client";

/**
 * The month's spending plan: what's safe to spend on extras, how it adds up
 * (each step opens to its items), "Can we afford it?", every budget down to
 * its transactions, and the limits.
 */

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import type { MonthPlanView, PlanGroup, PlanTxn } from "@/server/month-plan";
import { monthPlan, whatIf, type MonthPlanIn } from "@/lib/month-plan";
import { Button, Card, CONTROL, Select } from "@/components/ui";
import { addChargeAsBillAction, matchChargeToBillAction, resetLimitsAction, setLimitsAction, type EnvelopeState } from "./envelope-actions";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const exact = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const toCents = (text: string): number | null => {
  if (!text.trim()) return null;
  const n = Math.round(Number(text.replace(/[$,\s]/g, "")) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function planInput(plan: MonthPlanView): MonthPlanIn {
  return {
    incomeCents: plan.income.totalCents,
    billsCents: plan.bills.totalCents,
    debtCents: plan.debt.cents,
    closed: plan.closed,
    groups: plan.groups.map((g) => ({
      id: g.id,
      tier: g.tier === "SORT" ? "UNPLANNED" : g.tier,
      manualCents: g.manualCents,
      usualCents: g.usualCents,
      spentCents: g.spentCents,
    })),
  };
}

/** A charge's "Make it a bill": a monthly bill from this charge, tied to its merchant. */
export function MakeBill({ id }: { id: string }) {
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  if (state?.ok) return <span className="shrink-0 text-ok">Added</span>;
  return (
    <button
      type="button"
      disabled={pending}
      title={state && !state.ok ? state.message : "A monthly bill from this charge's usual amount and day; later charges from here are recorded for it"}
      className={`shrink-0 font-semibold hover:underline ${state && !state.ok ? "text-danger" : "text-accent-text"}`}
      onClick={() => start(async () => setState(await addChargeAsBillAction(id)))}
    >
      {pending ? "Adding…" : state && !state.ok ? "Couldn't add" : "Make it a bill"}
    </button>
  );
}

/** "It's Church": records this charge as that bill's payment. */
function MatchBill({ txnId, bill }: { txnId: string; bill: { id: string; name: string; ym?: string | null } }) {
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  if (state?.ok) return <span className="shrink-0 text-ok">Recorded</span>;
  return (
    <button
      type="button"
      disabled={pending}
      title={state && !state.ok ? state.message : `Record this charge as ${bill.name}'s payment`}
      className={`shrink-0 font-semibold hover:underline ${state && !state.ok ? "text-danger" : "text-accent-text"}`}
      onClick={() => start(async () => setState(await matchChargeToBillAction(txnId, bill.id, bill.ym ?? null)))}
    >
      {pending ? "Recording…" : state && !state.ok ? state.message : `It's ${bill.name}`}
    </button>
  );
}

export function Txns({ rows, bills = true, matches }: { rows: PlanTxn[]; bills?: boolean; matches?: Record<string, Array<{ id: string; name: string; ym?: string | null }>> }) {
  if (!rows.length) return <p className="text-xs text-muted">Nothing yet.</p>;
  return (
    <ul className="divide-y divide-line text-xs">
      {rows.map((t, i) => (
        <li key={`${t.id}:${i}`} className="flex items-baseline justify-between gap-3 py-1">
          <span className="min-w-0 flex-1 truncate">
            <span className="tnum text-muted">{day(t.date)}</span> {t.name}
            {t.pending ? <span className="text-muted"> · pending</span> : null}
            {t.split ? <span className="text-muted"> · part of an order</span> : null}
          </span>
          {bills && t.cents > 0 && !t.split && !t.pending ? (
            matches?.[t.id]?.length ? (
              matches[t.id].map((b) => <MatchBill key={b.id} txnId={t.id} bill={b} />)
            ) : (
              <MakeBill id={t.id} />
            )
          ) : null}
          <span className="tnum shrink-0">{exact(t.cents)}</span>
        </li>
      ))}
    </ul>
  );
}

/** One step of the sum: a label and amount that opens to what's behind it. */
function Step({ sign, label, cents, note, strong, children }: { sign?: "−" | "="; label: string; cents: number; note?: ReactNode; strong?: boolean; children?: ReactNode }) {
  const row = (
    <span className="flex items-baseline gap-3">
      <span className="w-4 shrink-0 text-center font-bold text-muted">{sign ?? ""}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${strong ? "font-bold" : ""} ${children ? "group-open:underline" : ""}`}>{label}</span>
        {note ? <span className="block text-xs text-muted">{note}</span> : null}
      </span>
      <span className={`tnum shrink-0 ${strong ? "text-base font-bold" : "text-sm font-semibold"}`}>{money(cents)}</span>
    </span>
  );
  if (!children) return <li className={`py-2 ${strong ? "border-t-2 border-line" : ""}`}>{row}</li>;
  return (
    <li className={`py-2 ${strong ? "border-t-2 border-line" : ""}`}>
      <details className="group">
        <summary className="cursor-pointer list-none">{row}</summary>
        <div className="ml-7 mt-2 rounded-xl bg-neutral-soft px-3 py-2">{children}</div>
      </details>
    </li>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-ok-soft text-ok" },
  due: { label: "Due", cls: "bg-neutral-soft text-muted ring-1 ring-line" },
  overdue: { label: "Overdue", cls: "bg-danger-soft text-danger" },
  skipped: { label: "Not this month", cls: "bg-neutral-soft text-muted" },
};

export function HowItAddsUp({ plan }: { plan: MonthPlanView }) {
  const sorts = plan.groups.filter((g) => g.tier === "SORT");
  const byTier = (t: PlanGroup["tier"]) => plan.groups.filter((g) => g.tier === t).reduce((s, g) => s + g.spentCents, 0);
  const d = plan.debt;
  return (
    <Card>
      <h2 className="text-base font-bold">How It Adds Up</h2>
      <p className="mt-0.5 text-xs text-muted">Tap a line to see what&rsquo;s in it.</p>
      <ol className="mt-2 divide-y divide-line">
        <Step label="Money in" cents={plan.income.totalCents} note={`${money(plan.income.receivedCents)} received so far; the rest is expected`}>
          <ul className="divide-y divide-line text-xs">
            {plan.income.items.map((i) => (
              <li key={`${i.lineItemId}:${i.dueOn}`} className="flex justify-between gap-3 py-1">
                <span className="min-w-0 truncate">
                  <span className="tnum text-muted">{day(i.dueOn)}</span> {i.name}
                  <span className="text-muted"> · {i.received ? "received" : "expected"}</span>
                </span>
                <span className="tnum shrink-0">{exact(i.cents)}</span>
              </li>
            ))}
          </ul>
        </Step>
        <Step
          sign="−"
          label="Bills"
          cents={plan.bills.totalCents}
          note={`Every bill this month, whole. ${money(plan.bills.paidCents)} paid${plan.bills.items.some((b) => b.status === "overdue") ? " · some are overdue" : ""}`}
        >
          <ul className="divide-y divide-line text-xs">
            {plan.bills.items.map((b) => (
              <li key={`${b.lineItemId}:${b.dueOn}`} className="flex items-center justify-between gap-3 py-1">
                <span className="min-w-0 truncate">
                  <span className="tnum text-muted">{day(b.dueOn)}</span> {b.name}
                  {b.from ? <span className="text-muted"> · from {monthName(b.from)}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
                  <span className="tnum">{exact(b.cents)}</span>
                </span>
              </li>
            ))}
          </ul>
          {plan.bills.other.length ? (
            <>
              <p className="mt-2 text-xs font-semibold">Charges in bill categories that aren&rsquo;t on the bill list ({exact(plan.bills.otherCents)})</p>
              <Txns rows={plan.bills.other} />
            </>
          ) : null}
          <Link href={`/month/${plan.month.slice(0, 4)}/${Number(plan.month.slice(5, 7))}`} className="mt-2 inline-block text-xs font-semibold text-accent-text hover:underline">
            Open the month&rsquo;s bills
          </Link>
        </Step>
        {d.cents > 0 || d.balanceCents ? (
          <Step
            sign="−"
            label={`Debt payment${d.name ? `: ${d.name}` : ""}`}
            cents={d.cents}
            note={
              d.source === "paid" ? "Paid this month" : d.source === "set" ? "The amount you set" : d.source === "plan" ? "The bill for that card" : d.source === "minimum" ? "About the minimum (1% of the balance)" : undefined
            }
          >
            <ul className="space-y-1 text-xs">
              {d.dueOn ? <li>Due {day(d.dueOn)}</li> : null}
              {d.balanceCents !== null ? <li>{exact(d.balanceCents)} owed{d.endsOn ? `; the 0% offer ends ${day(d.endsOn)}, ${d.endsOn.slice(0, 4)}` : ""}</li> : null}
              {d.doneIn ? <li>At {money(d.cents)} a month it&rsquo;s paid off in {monthName(d.doneIn)}.</li> : null}
              {d.targetCents ? (
                <li className={d.cents >= d.targetCents ? "text-ok" : "text-warn"}>
                  Paying it off before the offer ends takes {money(d.targetCents)} a month{d.cents >= d.targetCents ? ". This month is on track." : "."}
                </li>
              ) : null}
            </ul>
            <Link href="/settings/budgets" className="mt-2 inline-block text-xs font-semibold text-accent-text hover:underline">
              Change the debt payment
            </Link>
          </Step>
        ) : null}
        <Step sign="=" label="The pool for everything else" cents={plan.poolCents} strong note="Essentials, Extras and Unplanned spending" />
        <Step sign="−" label={plan.closed ? "Spent" : "Spent so far"} cents={plan.spentCents} note="On cards and from checking, by transaction date">
          <ul className="space-y-1 text-xs">
            <li className="flex justify-between"><span>Essentials</span><span className="tnum">{exact(byTier("ESSENTIAL"))}</span></li>
            <li className="flex justify-between"><span>Extras</span><span className="tnum">{exact(byTier("FLEXIBLE"))}</span></li>
            <li className="flex justify-between"><span>Unplanned</span><span className="tnum">{exact(byTier("UNPLANNED"))}</span></li>
            {sorts.length ? <li className="flex justify-between"><span>Needs sorting</span><span className="tnum">{exact(byTier("SORT"))}</span></li> : null}
          </ul>
          <p className="mt-1 text-xs text-muted">Each budget below opens to its transactions.</p>
        </Step>
        <Step sign="=" label="Left in the pool" cents={plan.poolLeftCents} strong />
        {!plan.closed ? (
          <Step sign="−" label="Essentials still to come" cents={plan.stillToComeCents} note="What groceries, fuel and the like still need this month">
            <ul className="space-y-1 text-xs">
              {plan.groups
                .filter((g) => g.tier === "ESSENTIAL")
                .map((g) => (
                  <li key={g.id} className="flex justify-between gap-3">
                    <span>
                      {g.name} <span className="text-muted">({money(g.spentCents)} of {money(g.limitCents ?? 0)} spent)</span>
                    </span>
                    <span className="tnum">{exact(g.leftCents ?? 0)}</span>
                  </li>
                ))}
            </ul>
          </Step>
        ) : null}
        {!plan.closed ? <Step sign="=" label={plan.safeCents < 0 ? "Over by" : "Safe to spend on extras"} cents={Math.abs(plan.safeCents)} strong /> : null}
      </ol>
    </Card>
  );
}

export function WhatIf({ plan }: { plan: MonthPlanView }) {
  const choices = plan.groups.filter((g) => g.tier !== "SORT");
  const first = choices.find((g) => g.tier === "FLEXIBLE")?.id ?? choices[0]?.id ?? "";
  const [rows, setRows] = useState<Array<{ amount: string; groupId: string }>>([{ amount: "", groupId: first }]);
  const purchases = rows.map((r) => ({ groupId: r.groupId, cents: toCents(r.amount) ?? 0 })).filter((p) => p.cents > 0);
  const after = useMemo(() => (purchases.length ? whatIf(planInput(plan), purchases) : null), [plan, purchases]);
  const total = purchases.reduce((s, p) => s + p.cents, 0);
  const before = new Map(plan.groups.map((g) => [g.id, g.roomCents]));
  const changed = after
    ? after.groups.filter((g) => g.roomCents !== null && g.roomCents !== before.get(g.id)).map((g) => ({ g, was: before.get(g.id) ?? 0 }))
    : [];
  const name = new Map(plan.groups.map((g) => [g.id, g.name]));
  return (
    <Card>
      <h2 className="text-base font-bold">Can We Afford It?</h2>
      <p className="mt-0.5 text-xs text-muted">Add one or more purchases to see what they&rsquo;d do before saying yes.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-28 shrink-0">
              <input
                aria-label="Amount"
                className={CONTROL}
                inputMode="decimal"
                placeholder="$"
                value={r.amount}
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))}
              />
            </span>
            <span className="min-w-0 flex-1">
              <Select aria-label="Budget" value={r.groupId} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, groupId: e.target.value } : x)))}>
                {choices.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </span>
            {rows.length > 1 ? (
              <button type="button" aria-label="Remove" className="px-2 text-muted hover:text-foreground" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Button type="button" variant="quiet" onClick={() => setRows([...rows, { amount: "", groupId: first }])}>
          Add another
        </Button>
        {purchases.length ? (
          <Button type="button" variant="quiet" onClick={() => setRows([{ amount: "", groupId: first }])}>
            Clear
          </Button>
        ) : null}
      </div>
      {after ? (
        <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-sm ${after.safeCents < 0 ? "bg-danger-soft text-danger" : after.safeCents < 20_000 ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
          <p>
            {money(total)} would take safe to spend from <b>{money(plan.safeCents)}</b> to{" "}
            <b>{after.safeCents < 0 ? `over by ${money(-after.safeCents)}` : money(after.safeCents)}</b>.
          </p>
          {changed.length ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {changed.map(({ g, was }) => (
                <li key={g.id}>
                  {name.get(g.id)}: room {money(was ?? 0)} → {money(g.roomCents ?? 0)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Bar({ used, tone }: { used: number; tone: "ok" | "warn" | "over" }) {
  const color = tone === "over" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-ok";
  return (
    <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-neutral-soft" aria-hidden>
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, used * 100))}%` }} />
    </span>
  );
}

function GroupRow({ g, share, safeCents }: { g: PlanGroup; share: number; safeCents: number }) {
  const limit = g.limitCents;
  const used = limit ? g.spentCents / limit : g.spentCents > 0 ? 1 : 0;
  const tone = g.overCents > 0 ? "over" : limit !== null && used > Math.min(1, share + 0.15) ? "warn" : "ok";
  let right: ReactNode;
  let note: string;
  if (g.tier === "FLEXIBLE") {
    right = (
      <span className="tnum shrink-0">
        <b>{money(g.roomCents ?? 0)}</b> <span className="text-xs text-muted">room</span>
      </span>
    );
    const own = g.leftCents ?? 0;
    note =
      g.overCents > 0
        ? `${money(g.spentCents)} spent of a ${money(limit ?? 0)} limit: ${money(g.overCents)} over`
        : (g.roomCents ?? 0) < own
          ? `${money(g.spentCents)} of ${money(limit ?? 0)} spent. Only ${money(Math.max(0, safeCents))} is safe to spend this month, so that's all the room it has.`
          : `${money(g.spentCents)} of ${money(limit ?? 0)} spent`;
  } else if (g.tier === "ESSENTIAL") {
    right = g.overCents > 0 ? (
      <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">{money(g.overCents)} over</span>
    ) : (
      <span className="tnum shrink-0">
        <b>{money(g.leftCents ?? 0)}</b> <span className="text-xs text-muted">still to come</span>
      </span>
    );
    note = `${money(g.spentCents)} of ${money(limit ?? 0)} spent${g.automatic ? " · limit from usual spending" : ""}`;
  } else {
    right = (
      <span className="tnum shrink-0">
        <b>{money(g.spentCents)}</b> <span className="text-xs text-muted">spent</span>
      </span>
    );
    note = g.tier === "SORT" ? "Counts against the month until it's sorted" : g.usualCents ? `Not set aside. About ${money(g.usualCents * 12)} over the last year, in lumps.` : "Not set aside";
  }
  return (
    <li className="py-2.5">
      <details className="group">
        <summary className="cursor-pointer list-none">
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold group-open:underline">{g.name}</span>
            {right}
          </span>
          {limit !== null ? <Bar used={used} tone={tone} /> : null}
          <span className="mt-1 block text-xs text-muted">{note}</span>
        </summary>
        <div className="mt-2 space-y-2 rounded-xl bg-neutral-soft px-3 py-2">
          {g.categories.length ? (
            g.categories.map((c) => (
              <details key={c.id ?? "none"} className="group/c">
                <summary className="flex cursor-pointer list-none justify-between gap-3 text-xs font-semibold">
                  <span className="truncate group-open/c:underline">{c.name}</span>
                  <span className="tnum">{exact(c.spentCents)}</span>
                </summary>
                <div className="mt-1 pl-2">
                  <Txns rows={c.transactions} />
                </div>
              </details>
            ))
          ) : (
            <p className="text-xs text-muted">Nothing spent this month.</p>
          )}
          {g.tier === "SORT" ? (
            <Link href={g.id === "uncategorized" ? "/insights/uncategorized" : "/settings/budgets"} className="inline-block text-xs font-semibold text-accent-text hover:underline">
              {g.id === "uncategorized" ? "Sort them by merchant" : "Place these categories in a budget"}
            </Link>
          ) : null}
        </div>
      </details>
    </li>
  );
}

const TIER_CARDS: Array<{ tier: PlanGroup["tier"]; title: string; note: string }> = [
  { tier: "ESSENTIAL", title: "Essentials", note: "Needed every month. What they haven't spent yet is held back from safe to spend." },
  { tier: "FLEXIBLE", title: "Extras", note: "Room is never more than what's safe to spend, so an overspend anywhere shrinks all of them." },
  { tier: "UNPLANNED", title: "Unplanned", note: "Irregular costs. No limit; they come out of the month they happen." },
  { tier: "SORT", title: "Needs sorting", note: "Spending without a category or a budget. It still counts." },
];

export function Limits({ plan }: { plan: MonthPlanView }) {
  const editable = plan.groups.filter((g) => g.tier === "ESSENTIAL" || g.tier === "FLEXIBLE");
  const [manual, setManual] = useState<Record<string, string>>(() =>
    Object.fromEntries(editable.filter((g) => g.manualCents !== null).map((g) => [g.id, String(Math.round(g.manualCents! / 100))])),
  );
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  const parsed = (id: string) => (manual[id] === undefined ? null : toCents(manual[id]));
  const preview = useMemo(() => {
    const input = planInput(plan);
    return monthPlan({ ...input, groups: input.groups.map((g) => (editable.some((e) => e.id === g.id) ? { ...g, manualCents: parsed(g.id) } : g)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, plan]);
  const limitOf = new Map(preview.groups.map((g) => [g.id, g.limitCents]));
  return (
    <Card>
      <h2 className="text-base font-bold">Limits</h2>
      <p className="mt-0.5 max-w-prose text-xs text-muted">
        For the month. Type one to set it; leave it empty for automatic. Automatic essentials use usual spending; automatic extras use usual spending,
        scaled down together when they don&rsquo;t all fit in the pool. Changes show in the totals below before you save.
      </p>
      {(["ESSENTIAL", "FLEXIBLE"] as const).map((tier) => (
        <div key={tier} className="mt-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted">{tier === "ESSENTIAL" ? "Essentials" : "Extras"}</h3>
          <ul className="divide-y divide-line">
            {editable
              .filter((g) => g.tier === tier)
              .map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{g.name}</span> <span className="text-xs text-muted">usually {money(g.usualCents)}</span>
                  </span>
                  <span className="tnum shrink-0 text-right text-muted">{parsed(g.id) === null ? money(limitOf.get(g.id) ?? 0) : ""}</span>
                  <span className="w-24 shrink-0">
                    <input
                      aria-label={`Limit for ${g.name}`}
                      className={CONTROL}
                      inputMode="decimal"
                      placeholder="auto"
                      value={manual[g.id] ?? ""}
                      onChange={(e) => {
                        const next = { ...manual };
                        if (e.target.value.trim()) next[g.id] = e.target.value;
                        else delete next[g.id];
                        setManual(next);
                      }}
                    />
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      <p className="mt-3 text-xs text-muted">
        Pool {money(preview.poolCents)} · essentials {money(preview.essentialLimitCents)} · extras {money(preview.flexibleLimitCents)}
        {preview.gapCents > 0 ? ` · usual spending is ${money(preview.gapCents)} more than the pool` : ""}
      </p>
      {preview.shortCents > 0 ? (
        <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">The limits you set add up to {money(preview.shortCents)} more than the pool.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={pending} onClick={() => start(async () => setState(await setLimitsAction(Object.fromEntries(editable.map((g) => [g.id, parsed(g.id)])))))}>
          Save limits
        </Button>
        <Button
          type="button"
          variant="quiet"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setManual({});
              setState(await resetLimitsAction());
            })
          }
        >
          All automatic
        </Button>
        {state ? <span className={`text-xs ${state.ok ? "text-muted" : "text-danger"}`}>{state.message}</span> : null}
      </div>
    </Card>
  );
}

/** The headline: safe to spend (or over by) for the month, and why. */
export function PlanHero({ plan }: { plan: MonthPlanView }) {
  const over = plan.safeCents < 0;
  const unplannedUsual = plan.unplannedUsualCents;
  return (
    <Card>
      {plan.closed ? (
        <>
          <p className="text-sm text-muted">{monthName(plan.month)}, after bills</p>
          <p className={`tnum mt-1 text-4xl font-bold ${plan.poolLeftCents < 0 ? "text-danger" : ""}`}>
            {plan.poolLeftCents < 0 ? `Over by ${money(-plan.poolLeftCents)}` : `${money(plan.poolLeftCents)} not spent`}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{over ? "This month is" : "Safe to spend on extras"}</p>
          <p className={`tnum mt-1 text-4xl font-bold ${over ? "text-danger" : plan.standing === "low" ? "text-warn" : ""}`}>
            {over ? `Over by ${money(-plan.safeCents)}` : money(plan.safeCents)}
          </p>
          {plan.groups.some((g) => g.tier === "FLEXIBLE") ? (
            <p className="mt-1 text-sm">
              Extras&rsquo; limits have <b>{money(plan.groups.reduce((s, g) => s + (g.roomCents ?? 0), 0))}</b> of room left in all.
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted">
            For the rest of {monthName(plan.month).split(" ")[0]} ({plan.daysLeft} day{plan.daysLeft === 1 ? "" : "s"}), after every bill and the
            groceries, fuel and other essentials still to come.
          </p>
        </>
      )}
      {plan.message ? (
        <p className={`mt-3 rounded-xl px-3.5 py-2.5 text-sm ${over || plan.shortCents > 0 ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{plan.message}</p>
      ) : null}
      {unplannedUsual > 0 && !plan.closed ? (
        <p className="mt-2 text-xs text-muted">
          Unplanned costs (repairs, medical, the vet, lessons and the like) came to about {money(unplannedUsual * 12)} over the last year. Nothing is set
          aside for them, so when one comes it comes out of what&rsquo;s safe to spend.
        </p>
      ) : null}
    </Card>
  );
}

/** Every budget against its limit, by kind, each opening to its categories and charges. */
export function TierCards({ plan }: { plan: MonthPlanView }) {
  const share = plan.daysInMonth ? (plan.daysInMonth - plan.daysLeft) / plan.daysInMonth : 1;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
        {TIER_CARDS.map(({ tier, title, note }) => {
          const rows = plan.groups.filter((g) => g.tier === tier && (g.tier !== "SORT" || g.spentCents !== 0));
          if (!rows.length) return null;
          const spent = rows.reduce((s, g) => s + g.spentCents, 0);
          return (
            <Card key={tier}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold">{title}</h2>
                <span className="tnum text-sm text-muted">{money(spent)} spent</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{note}</p>
              <ul className="mt-1 divide-y divide-line">
                {rows.map((g) => (
                  <GroupRow key={g.id} g={g} share={share} safeCents={plan.safeCents} />
                ))}
              </ul>
            </Card>
          );
        })}
    </div>
  );
}
