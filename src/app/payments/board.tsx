"use client";

/**
 * The Payments page: pick a payment, pick how much and when, and see what it does before it's made.
 * Every figure is worked out here from what the server sent, so changing the amount, the day or
 * the checking balance shows the effect at once. A typed checking balance stays on this page.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { CashEvent, PaymentChoice, PaymentsView, Tier } from "@/server/payments";
import type { BudgetChange } from "@/server/budget-changes";
import { setBudgetAction, setPaymentAction, snoozeOverAction } from "./actions";
import { changeUsualAmountAction, dismissAmountAction } from "../line-items/actions";

const whole = (c: number) => `${c < 0 ? "−" : ""}$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;
const exact = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (c: number) => (c > 0 ? `+${whole(c)}` : whole(c));
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
const toCentsInput = (s: string): number | null => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
};
const TIER_NAME: Record<Tier, string> = { BILLS: "Bills", ESSENTIAL: "Essentials", FLEXIBLE: "Extras", UNPLANNED: "Unplanned" };
const PERIOD_NAME = { INCOME: "Income", BILLS: "Bills", DEBT: "0% payment", ESSENTIAL: "Essentials", FLEXIBLE: "Extras", UNPLANNED: "Unplanned" } as const;

const card = "rounded-2xl border border-line bg-surface p-4 shadow-card";
const step = "text-[11px] font-bold uppercase tracking-wide text-accent-text";
const input = "w-28 rounded-lg border border-line bg-field px-2 py-1.5 text-sm tnum";
const btn = "rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

type Mode = "full" | "adjust" | "other";

export function PaymentsBoard({ v }: { v: PaymentsView }) {
  const chips = v.choices.filter((x) => x.preferred);
  const [key, setKey] = useState(chips[0]?.key ?? "");
  const c = v.choices.find((x) => x.key === key) ?? chips[0];
  const [periodIx, setPeriodIx] = useState(v.periods.length > 1 ? 1 : 0);
  const [typedChecking, setTypedChecking] = useState("");
  const [checkingOverride, setCheckingOverride] = useState<number | null>(null);

  if (!c) {
    return (
      <div className="space-y-3">
        <h1 className="font-heading text-[28px] font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted">No payments coming up.</p>
      </div>
    );
  }
  const checking = checkingOverride ?? v.checking.cents;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-[26px] font-bold tracking-tight">Payments</h1>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setKey(x.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${x.group === c.group ? "border-foreground bg-foreground text-surface" : "border-line bg-surface"}`}
            >
              {x.name} <span className="font-normal opacity-75">{short(x.set?.on ?? x.dueOn)}</span>
            </button>
          ))}
        </div>
        {v.periods.length > 1 ? (
          <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-line bg-surface text-xs font-semibold">
            {v.periods.map((p, i) => (
              <button key={p.label} type="button" onClick={() => setPeriodIx(i)} className={`px-3 py-1.5 ${i === periodIx ? "bg-foreground text-surface" : ""}`}>
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <Choice key={c.key} c={c} v={v} checking={checking} siblings={v.choices.filter((x) => x.group === c.group)} onCycle={setKey}>
        <div className={card}>
          <p className={step}>Checking balance</p>
          <p className="mt-1 text-xs text-muted">{checkingOverride !== null ? "Typed in" : v.checking.asOf ? `From the bank · ${new Date(v.checking.asOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "From the bank"}</p>
          <p className="tnum text-2xl font-extrabold tracking-tight">{checking === null ? "—" : exact(checking)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className={input} inputMode="decimal" placeholder="$0.00" value={typedChecking} onChange={(e) => setTypedChecking(e.target.value)} aria-label="Checking balance" />
            <button type="button" className={btn} onClick={() => setCheckingOverride(toCentsInput(typedChecking))} disabled={toCentsInput(typedChecking) === null}>
              Use
            </button>
            <button
              type="button"
              className={btn}
              disabled={checkingOverride === null}
              onClick={() => {
                setCheckingOverride(null);
                setTypedChecking("");
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </Choice>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
        <Period p={v.periods[periodIx]} />
        <History c={c} checking={v.checkingHistory} />
      </div>
    </div>
  );
}

/** The three columns for one payment. Keyed by the payment, so switching starts it fresh. */
function Choice({ c, v, checking, siblings, onCycle, children }: { c: PaymentChoice; v: PaymentsView; checking: number | null; siblings: PaymentChoice[]; onCycle: (key: string) => void; children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("full");
  const [adjust, setAdjust] = useState("");
  const [other, setOther] = useState(c.set ? (c.set.cents / 100).toFixed(2) : "");
  const [on, setOn] = useState(c.set?.on ?? (c.dueOn < v.today ? v.today : c.dueOn));
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const statementCents = mode === "adjust" ? (toCentsInput(adjust) ?? c.fullCents) : c.fullCents;
  const left = (n: number) => Math.max(0, n - c.paidCents);
  const payCents = mode === "other" ? (toCentsInput(other) ?? 0) : left(statementCents);
  const isCard = c.kind === "card";
  const open = c.cycle === "open";
  const fullLabel = open ? "Planned statement" : isCard ? "Full statement" : c.kind === "debt" ? "Planned payment" : "Usual amount";

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-3">
        {children}
        <div className={card}>
          <div className="flex items-center gap-2">
            <p className={step}>What to pay</p>
            <span className="flex-1" />
            {open && c.balanceCents !== null ? <span className="text-xs text-muted">{exact(c.balanceCents)} so far</span> : c.paidCents > 0 ? <span className="text-xs text-muted">{c.paidCents >= c.fullCents ? "Paid" : `${exact(c.paidCents)} paid`}</span> : null}
          </div>
          {siblings.length > 1 ? (
            <div className="mt-2 inline-flex overflow-hidden rounded-lg border border-line text-xs font-semibold">
              {siblings.map((x) => (
                <button key={x.key} type="button" onClick={() => onCycle(x.key)} className={`px-2.5 py-1 ${x.key === c.key ? "bg-foreground text-surface" : ""}`}>
                  {x.statement ? `${short(x.statement.from)} – ${short(x.statement.to)}` : short(x.dueOn)}
                  {x.cycle === "closed" && x.paidCents >= x.fullCents ? " · Paid" : ""}
                </button>
              ))}
            </div>
          ) : null}
          <Option on={mode === "full"} onPick={() => setMode("full")} label={fullLabel} right={<b className="tnum">{exact(c.fullCents)}</b>} />
          {isCard && !open ? (
            <Option on={mode === "adjust"} onPick={() => setMode("adjust")} label="Adjust statement" sub="Use this if the full statement doesn't match the actual statement" right={<input className={input} inputMode="decimal" placeholder="$0.00" value={adjust} onFocus={() => setMode("adjust")} onChange={(e) => setAdjust(e.target.value)} aria-label="Actual statement" />} />
          ) : null}
          <Option on={mode === "other"} onPick={() => setMode("other")} label="Other amount" right={<input className={input} inputMode="decimal" placeholder="$0.00" value={other} onFocus={() => setMode("other")} onChange={(e) => setOther(e.target.value)} aria-label="Other amount" />} />
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>From checking on</span>
            <input type="date" className="rounded-lg border border-line bg-field px-2 py-1 text-sm" value={on} min={v.today} onChange={(e) => setOn(e.target.value)} aria-label="Payment date" />
            <span className="flex-1" />
            {c.set ? (
              <button type="button" className={btn} disabled={busy} onClick={() => start(async () => setNote(((r) => (r.ok ? (r.message ?? null) : r.message))(await setPaymentAction(c.key, null, null))))}>
                Clear
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-50"
              onClick={() => start(async () => setNote(((r) => (r.ok ? (r.message ?? null) : r.message))(await setPaymentAction(c.key, c.paidCents + payCents, on))))}
            >
              Set payment
            </button>
          </div>
          {note ? <p className="mt-1.5 text-xs text-muted">{note}</p> : null}
        </div>
      </div>

      <Impacts c={c} v={v} checking={checking} payCents={payCents} on={on} />

      <div className="flex min-w-0 flex-col gap-3">
        {c.statement ? <PlannedVsActual c={c} statementCents={open ? (c.balanceCents ?? 0) : statementCents} /> : null}
        <Changes changes={v.changes} />
      </div>
    </div>
  );
}

function Option({ on, onPick, label, sub, right }: { on: boolean; onPick: () => void; label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div onClick={onPick} className={`mt-1.5 cursor-pointer rounded-xl border px-3 py-2 ${on ? "border-accent bg-accent-soft" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <b className="text-sm">{label}</b>
        <span className="flex-1" />
        {right}
      </div>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function Ledger({ rows, total, totalLabel }: { rows: Array<[string, number]>; total: number; totalLabel: string }) {
  return (
    <table className="mt-1 w-full text-sm">
      <tbody>
        {rows.map(([label, cents]) => (
          <tr key={label}>
            <td className="py-0.5">{label}</td>
            <td className="tnum py-0.5 text-right">{whole(cents)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-foreground font-bold">
          <td className="pt-1.5">{totalLabel}</td>
          <td className={`tnum pt-1.5 text-right ${total < 0 ? "text-danger" : "text-ok"}`}>{whole(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** The month's income against this payment, and checking until the payday after it. */
function Impacts({ c, v, checking, payCents, on }: { c: PaymentChoice; v: PaymentsView; checking: number | null; payCents: number; on: string }) {
  const L = v.ledgers[c.month];
  const cardId = c.kind === "card" ? c.key.split(":")[1] : null;
  const monthRows: Array<[string, number]> = L
    ? ([
        ["Pay", L.payCents],
        ["Bills from checking", -(L.billsCents - (c.kind === "bill" ? (L.choiceBills[c.key] ?? 0) : 0))],
        ["0% payment", c.kind === "debt" ? 0 : -L.debtCents],
        ["Other cards", -Object.entries(L.cards).filter(([id]) => id !== cardId).reduce((t, [, n]) => t + n, 0)],
        ["This payment", -(c.paidCents + payCents)],
      ] as Array<[string, number]>).filter(([label, n], i) => i === 0 || label === "This payment" || n !== 0)
    : [];
  const monthTotal = monthRows.reduce((t, [, n]) => t + n, 0);

  const cash = useMemo(() => {
    if (checking === null) return null;
    const list: CashEvent[] = v.events.filter((e) => e.key !== c.key);
    if (payCents > 0) list.push({ date: on, cents: -payCents, kind: c.kind === "debt" ? "debt" : c.kind === "bill" ? "bill" : "card", name: "This payment", key: "this" });
    list.sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents);
    const payday = list.find((e) => e.kind === "pay" && e.date > on)?.date ?? null;
    const window = list.filter((e) => !payday || e.date < payday);
    let bal = checking;
    let low = { cents: checking, on: v.today };
    window.forEach((e, i) => {
      bal += e.cents;
      if (window[i + 1]?.date !== e.date && bal < low.cents) low = { cents: bal, on: e.date };
    });
    const sum = (f: (e: CashEvent) => boolean) => window.filter(f).reduce((t, e) => t + e.cents, 0);
    return {
      payday,
      low,
      end: bal,
      rows: [
        ["Checking now", checking],
        ["Pay", sum((e) => e.kind === "pay")],
        ["Bills", sum((e) => e.kind === "bill" && e.key !== "this")],
        ["Other cards and 0%", sum((e) => (e.kind === "card" || e.kind === "debt") && e.key !== "this")],
        ["This payment", sum((e) => e.key === "this")],
      ] as Array<[string, number]>,
    };
  }, [checking, v.events, v.today, c.key, c.kind, payCents, on]);

  return (
    <div className={card}>
      <p className={step}>Payment impacts</p>
      {L ? (
        <>
          <p className="mt-2.5 text-xs font-semibold text-muted">{monthName(c.month)} income</p>
          <Ledger rows={monthRows} total={monthTotal} totalLabel={monthTotal < 0 ? "Over income" : "Under income"} />
        </>
      ) : null}
      {cash ? (
        <>
          <p className="mt-3 text-xs font-semibold text-muted">{cash.payday ? `Checking until payday ${short(cash.payday)}` : "Checking"}</p>
          <Ledger rows={cash.rows.filter(([label, n], i) => i === 0 || label === "This payment" || n !== 0)} total={cash.end} totalLabel={cash.payday ? `Day before payday` : "After"} />
          <div className="mt-1 flex text-sm font-semibold">
            <span>Lowest · {short(cash.low.on)}</span>
            <span className="flex-1" />
            <span className={`tnum ${cash.low.cents < 0 ? "text-danger" : ""}`}>{whole(cash.low.cents)}</span>
          </div>
          {cash.low.cents < 0 ? (
            <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
              Short {whole(-cash.low.cents)} on {short(cash.low.on)}.{" "}
              {payCents + cash.low.cents > 0 ? `Pay ${whole(payCents + cash.low.cents)} or less` : "Don't pay yet"}
              {cash.payday ? `, or pay on ${short(cash.payday)}.` : "."}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">Checking isn&apos;t known yet.</p>
      )}
    </div>
  );
}

function PlannedVsActual({ c, statementCents }: { c: PaymentChoice; statementCents: number }) {
  const s = c.statement!;
  const other = s.otherCents + (c.cycle === "open" ? 0 : statementCents - c.fullCents);
  const rows: Array<{ label: string; planned: number | null; actual: number }> = [
    ...s.rows.map((r) => ({ label: TIER_NAME[r.tier], planned: r.plannedCents, actual: r.actualCents })),
    ...(other ? [{ label: "Other", planned: null, actual: other }] : []),
    ...(s.carriedCents ? [{ label: "Carried from last statement", planned: null, actual: s.carriedCents }] : []),
    ...(s.paidDuringCents ? [{ label: "Paid during the statement", planned: null, actual: -s.paidDuringCents }] : []),
  ];
  const over = statementCents - s.plannedCents;
  const charges = statementCents - s.carriedCents + s.paidDuringCents;
  return (
    <div className={card}>
      <div className="flex items-center gap-2">
        <p className={step}>Planned vs actual</p>
        <span className="flex-1" />
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${charges > s.plannedCents ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>
          {charges > s.plannedCents ? `${whole(charges - s.plannedCents)} over` : `${whole(s.plannedCents - charges)} ${c.cycle === "open" ? "left" : "under"}`}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {short(s.from)} – {short(s.to)}
      </p>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted">
            <th className="py-1 text-left font-semibold" />
            <th className="py-1 pl-3 text-right font-semibold">Planned</th>
            <th className="py-1 pl-3 text-right font-semibold">Actual</th>
            <th className="w-16 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.planned === null ? null : r.actual - r.planned;
            return (
              <tr key={r.label} className="border-t border-line">
                <td className="py-1">{r.label}</td>
                <td className="tnum py-1 text-right">{r.planned === null ? "" : whole(r.planned)}</td>
                <td className="tnum py-1 text-right">{whole(r.actual)}</td>
                <td className={`tnum py-1 text-right ${d !== null && d > 0 ? "text-danger" : "text-ok"}`}>{d === null || d === 0 ? "" : signed(d)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-line font-bold">
            <td className="py-1">{c.cycle === "open" ? "Balance so far" : "Statement"}</td>
            <td className="tnum py-1 text-right">{whole(s.plannedCents)}</td>
            <td className="tnum py-1 text-right">{whole(statementCents)}</td>
            <td className={`tnum py-1 text-right ${over > 0 ? "text-danger" : "text-ok"}`}>{over ? signed(over) : ""}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Changes({ changes }: { changes: BudgetChange[] }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const act = (id: string, work: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await work();
      setDone((d) => ({ ...d, [id]: r.ok ? (r.message ?? "Done") : (r.message ?? "Couldn't save") }));
    });
  return (
    <div className={card}>
      <p className={step}>Budget changes</p>
      {changes.length === 0 ? <p className="mt-2 text-sm text-muted">None.</p> : null}
      <ul className="mt-1 max-h-56 divide-y divide-line overflow-y-auto">
        {changes.map((ch) => {
          const id = `${ch.kind}:${ch.id}`;
          return (
            <li key={id} className="flex items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                {ch.kind === "bill" ? (
                  <>
                    <p className="tnum">
                      {ch.name} {whole(ch.fromCents)} → {whole(ch.toCents)}
                    </p>
                    <p className="text-xs text-muted">{ch.why}</p>
                  </>
                ) : ch.kind === "unset" ? (
                  <>
                    <p>{ch.name}: no budget</p>
                    <p className="text-xs text-muted">Usual {whole(ch.toCents)}</p>
                  </>
                ) : (
                  <>
                    <p>{ch.name} over 3 months</p>
                    <p className="tnum text-xs text-muted">
                      {whole(ch.limitCents)} budget · {whole(ch.spentCents)} spent
                    </p>
                  </>
                )}
              </div>
              {done[id] ? (
                <span className="text-xs text-muted">{done[id]}</span>
              ) : ch.kind === "bill" ? (
                <>
                  <button type="button" className={btn} disabled={busy} onClick={() => act(id, () => changeUsualAmountAction(ch.id, ch.toCents, ch.startsFrom, false, false))}>
                    Accept
                  </button>
                  <button type="button" className={btn} disabled={busy} onClick={() => act(id, () => dismissAmountAction(ch.id, ch.toCents))}>
                    Skip
                  </button>
                </>
              ) : ch.kind === "unset" ? (
                <button type="button" className={btn} disabled={busy} onClick={() => act(id, () => setBudgetAction(ch.id, ch.toCents))}>
                  Set {whole(ch.toCents)}
                </button>
              ) : (
                <>
                  <Link href="/settings/budgets" className={btn}>
                    Review
                  </Link>
                  <button type="button" className={btn} disabled={busy} onClick={() => act(id, () => snoozeOverAction(ch.id, ch.limitCents))}>
                    Skip
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Period({ p }: { p: PaymentsView["periods"][number] }) {
  const get = (k: keyof typeof PERIOD_NAME) => p.rows.find((r) => r.key === k)!;
  const cols = (["INCOME", "BILLS", "DEBT", "ESSENTIAL", "FLEXIBLE", "UNPLANNED"] as const).filter((k) => k !== "DEBT" || get(k).plannedCents || get(k).actualCents);
  const leftOf = (f: "plannedCents" | "projectedCents") => get("INCOME")[f] - cols.filter((k) => k !== "INCOME").reduce((t, k) => t + get(k)[f], 0);
  const over = (k: (typeof cols)[number]) => k !== "INCOME" && get(k).projectedCents > get(k).plannedCents;
  const plannedLeft = leftOf("plannedCents");
  const projectedLeft = leftOf("projectedCents");
  return (
    <div className={`${card} overflow-x-auto`}>
      <p className={step}>
        {short(p.from)} – {short(p.to)}
      </p>
      <table className="mt-1 w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted">
            <th className="py-1 text-left font-semibold" />
            <th className="px-1.5 py-1 text-right font-semibold">Checking in</th>
            {cols.map((k) => (
              <th key={k} className="px-1.5 py-1 text-right font-semibold">
                {PERIOD_NAME[k]}
              </th>
            ))}
            <th className="px-1.5 py-1 text-right font-semibold">Left</th>
            <th className="px-1.5 py-1 text-right font-semibold">Checking out</th>
          </tr>
        </thead>
        <tbody className="tnum">
          <tr className="border-t border-line">
            <td className="py-1">Planned</td>
            <td />
            {cols.map((k) => (
              <td key={k} className="px-1.5 py-1 text-right">
                {whole(get(k).plannedCents)}
              </td>
            ))}
            <td className={`px-1.5 py-1 text-right ${plannedLeft < 0 ? "text-danger" : ""}`}>{whole(plannedLeft)}</td>
            <td />
          </tr>
          <tr className="border-t border-line">
            <td className="py-1">Actual</td>
            <td className="px-1.5 py-1 text-right">{p.checkingInCents === null ? "" : whole(p.checkingInCents)}</td>
            {cols.map((k) => (
              <td key={k} className="px-1.5 py-1 text-right">
                {whole(get(k).actualCents)}
              </td>
            ))}
            <td />
            <td />
          </tr>
          <tr className="border-t border-line font-bold">
            <td className="py-1">Projected</td>
            <td className="px-1.5 py-1 text-right">{p.checkingInCents === null ? "" : whole(p.checkingInCents)}</td>
            {cols.map((k) => (
              <td key={k} className={`px-1.5 py-1 text-right ${over(k) ? "text-danger" : ""}`}>
                {whole(get(k).projectedCents)}
              </td>
            ))}
            <td className={`px-1.5 py-1 text-right ${projectedLeft < 0 ? "text-danger" : projectedLeft < plannedLeft ? "text-danger" : ""}`}>{whole(projectedLeft)}</td>
            <td className={`px-1.5 py-1 text-right ${p.checkingOutCents !== null && p.checkingInCents !== null && p.checkingOutCents < p.checkingInCents ? "text-danger" : ""}`}>
              {p.checkingOutCents === null ? "" : whole(p.checkingOutCents)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Bars({ values, lines, labels, over }: { values: number[]; lines?: number[]; labels: string[]; over?: boolean[] }) {
  const max = Math.max(1, ...values, ...(lines ?? []));
  return (
    <div>
      <div className="flex h-16 items-end gap-1.5">
        {values.map((n, i) => (
          <div key={i} className={`relative flex-1 rounded-t ${over?.[i] ? "bg-danger/40" : "bg-accent/30"}`} style={{ height: `${Math.max(4, (Math.max(0, n) / max) * 64)}px` }} title={whole(n)}>
            {lines ? <i className="absolute -left-0.5 -right-0.5 border-t-2 border-foreground" style={{ bottom: `${(lines[i] / max) * 64 - 1}px`, top: "auto" }} /> : null}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-muted">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function History({ c, checking }: { c: PaymentChoice; checking: PaymentsView["checkingHistory"] }) {
  const h = c.history;
  const overCount = h.filter((x) => x.chargedCents > x.plannedCents).length;
  const change = checking.length > 1 ? checking[checking.length - 1].cents - checking[0].cents : 0;
  const mon = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return (
    <div className={`${card} grid grid-cols-2 gap-4`}>
      <div>
        <div className="flex items-center gap-2">
          <p className={step}>Statements</p>
          <span className="flex-1" />
          {h.length ? <span className="text-xs text-muted">Over {overCount} of {h.length}</span> : null}
        </div>
        {h.length ? (
          <div className="mt-2">
            <Bars values={h.map((x) => x.chargedCents)} lines={h.map((x) => x.plannedCents)} labels={h.map((x) => mon(x.closedOn))} over={h.map((x) => x.chargedCents > x.plannedCents)} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">For cards planned by cycle</p>
        )}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <p className={step}>Average checking</p>
          <span className="flex-1" />
          {checking.length > 1 ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${change < 0 ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>{signed(change)}</span> : null}
        </div>
        {checking.length ? (
          <div className="mt-2">
            <Bars values={checking.map((x) => x.cents)} labels={checking.map((x) => mon(x.on))} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
