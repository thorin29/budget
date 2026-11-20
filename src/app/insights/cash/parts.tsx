/**
 * Shared by the Cash and Calendar tabs: loading checking's timing in both cases, the case switch,
 * and money formats. Worst case = this month's Essentials and Extras budgets get used in full on
 * the cards (as on the Overview's Outlook); best case = only what's charged so far.
 */

import Link from "next/link";
import { getMonthPlan } from "@/server/month-plan";
import { getCashTiming, worstCase, type CashTimingView } from "@/server/cash-timing";
import { budgetLeftOf } from "@/server/plan-charts";
import { cushionSetting } from "@/server/envelopes";

export type Case = "worst" | "best";

export const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
export const signed = (cents: number) => `${cents < 0 ? "−" : "+"}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
export const exact = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function loadCash(): Promise<{ best: CashTimingView; worst: CashTimingView; budgetLeftCents: number; cushionCents: number } | null> {
  const plan = await getMonthPlan().catch(() => null);
  const [best, cushionCents] = await Promise.all([getCashTiming(plan?.debt.cents ?? 0).catch((error: unknown) => (console.error("Cash timing:", error), null)), cushionSetting()]);
  if (!best) return null;
  const budgetLeftCents = plan ? budgetLeftOf(plan) : 0;
  return { best, worst: worstCase(best, budgetLeftCents), budgetLeftCents, cushionCents };
}

/** A two-way switch as links, keeping the rest of the query. */
export function Switch({ options, on, href }: { options: Array<[string, string]>; on: string; href: (value: string) => string }) {
  return (
    <span className="flex gap-0.5 rounded-xl border border-line bg-surface p-1 text-sm font-semibold">
      {options.map(([value, label]) => (
        <Link key={value} href={href(value)} className={`rounded-lg px-3 py-1 ${value === on ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
          {label}
        </Link>
      ))}
    </span>
  );
}

export function MissingChecking() {
  return (
    <p className="text-sm text-muted">
      This needs checking&rsquo;s balance. Choose the bills account in{" "}
      <Link href="/settings/planning" className="font-semibold text-accent-text hover:underline">
        Settings
      </Link>{" "}
      and link it to the bank.
    </p>
  );
}
