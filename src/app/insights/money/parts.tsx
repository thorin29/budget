/**
 * Pieces shared by the Money tab and the pages its expense lines open: money formats, the bill
 * list, the spending chart, and the split of bills from subscriptions & autopay.
 */

import Link from "next/link";
import type { PlanBill, PlanGroup } from "@/server/month-plan";
import { SUBSCRIPTIONS } from "@/server/subscriptions";

export const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
export const exact = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

export const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-ok-soft text-ok" },
  due: { label: "Due", cls: "bg-neutral-soft text-muted ring-1 ring-line" },
  overdue: { label: "Overdue", cls: "bg-danger-soft text-danger" },
  skipped: { label: "Not this month", cls: "bg-neutral-soft text-muted" },
};

export const BADGE: Record<string, { label: string; cls: string }> = {
  ...STATUS,
  partly: { label: "Partly paid", cls: "bg-warn-soft text-warn" },
  actual: { label: "Actual", cls: "bg-ok-soft text-ok" },
};

/** Paid, due or partly paid, from what's paid of the total. */
export const payState = (paidCents: number, totalCents: number) => (totalCents <= 0 || paidCents >= totalCents ? "paid" : paidCents <= 0 ? "due" : "partly");

export const isSub = (b: PlanBill) => (b.category ?? "").toLowerCase() === SUBSCRIPTIONS.toLowerCase();
export const sumBills = (rows: PlanBill[]) => rows.reduce((t, b) => t + b.cents, 0);
export const paidBills = (rows: PlanBill[]) => rows.filter((b) => b.status === "paid").reduce((t, b) => t + b.cents, 0);

export function BillList({ rows }: { rows: PlanBill[] }) {
  if (!rows.length) return <p className="text-sm text-muted">None this month.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((b) => (
        <li key={`${b.lineItemId}:${b.dueOn}`} className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0 truncate">
            <span className="tnum text-xs text-muted">{day(b.dueOn)}</span> {b.name}
            {b.from ? <span className="text-muted"> · from {monthName(b.from)}</span> : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
            <span className="tnum">{exact(b.cents)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export const TIERS: Array<{ tier: PlanGroup["tier"]; label: string; color: string }> = [
  { tier: "ESSENTIAL", label: "Essentials", color: "var(--series-3)" },
  { tier: "FLEXIBLE", label: "Extras", color: "var(--series-4)" },
  { tier: "UNPLANNED", label: "Unplanned", color: "var(--series-5)" },
  { tier: "SORT", label: "Needs sorting", color: "var(--series-neutral)" },
];

/**
 * Shade n of a tier's color: the tier's biggest budget gets the darkest shade and each smaller
 * one a lighter step, so a budget always keeps its tier's color.
 */
export function shade(base: string, index: number, count: number) {
  if (count <= 1) return base;
  // Few budgets in a tier get a narrow spread, so two of them aren't near-black and near-white.
  const span = Math.min(1, 0.25 + (count - 1) * 0.25);
  const t = span * ((2 * index) / (count - 1) - 1); // −1 darkest … +1 lightest
  const pct = Math.round(t < 0 ? -t * 25 : t * 40);
  return pct === 0 ? base : `color-mix(in oklab, ${base}, ${t < 0 ? "black" : "white"} ${pct}%)`;
}

/** Everyday spending by budget, biggest first, each bar in its tier's color. */
export function SpendingChart({ groups, month }: { groups: PlanGroup[]; month: string }) {
  const rows = groups.filter((g) => g.spentCents > 0).sort((a, b) => b.spentCents - a.spentCents);
  if (!rows.length) return <p className="text-sm text-muted">Nothing spent yet.</p>;
  const total = rows.reduce((t, g) => t + g.spentCents, 0);
  const top = rows[0].spentCents;
  const color = new Map<string, string>();
  for (const { tier, color: base } of TIERS) {
    const inTier = rows.filter((g) => g.tier === tier);
    inTier.forEach((g, i) => color.set(g.id, shade(base, i, inTier.length)));
  }
  const used = TIERS.filter((t) => rows.some((g) => g.tier === t.tier));
  return (
    <div>
      <ul className="space-y-1">
        {rows.map((g) => (
          <li key={g.id}>
            <Link
              href={`/insights/money/budget/${encodeURIComponent(g.id)}?m=${month}`}
              className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem_2.5rem] items-center gap-3 rounded-lg px-1 py-1 text-sm hover:bg-neutral-soft sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.5rem_3rem]"
            >
              <span className="truncate font-medium">{g.name}</span>
              <span className="block h-4">
                <span className="block h-full rounded-r-md" style={{ width: `${Math.max(1, (g.spentCents / top) * 100)}%`, background: color.get(g.id) }} />
              </span>
              <span className="tnum text-right font-semibold">{money(g.spentCents)}</span>
              <span className="tnum text-right text-xs text-muted">{Math.round((g.spentCents / total) * 100)}%</span>
            </Link>
          </li>
        ))}
      </ul>
      {used.length > 1 ? (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {used.map((t) => (
            <span key={t.tier} className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
