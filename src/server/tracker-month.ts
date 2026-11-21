/**
 * The Tracker's month: the month view with each card-payment line set from its statement (the
 * closed statement's amount, or the plan for one still open or to come, see statement-plan.ts).
 * The month plan never counts card payments, so only the Tracker and the months API need this.
 */

import { getMonthView, type MonthEntry, type MonthView } from "./month";
import { cardPaymentLines } from "./statement-plan";

export type TrackerMonth = MonthView;

const sum = (list: MonthEntry[], f: (e: MonthEntry) => number) => list.reduce((t, e) => t + f(e), 0);
const remaining = (list: MonthEntry[]) => sum(list.filter((e) => e.actualCents === null), (e) => e.budgetedCents);

export async function getTrackerMonth(year: number, month: number): Promise<TrackerMonth> {
  const view = await getMonthView(year, month);
  const lines = await cardPaymentLines(year, month).catch(() => new Map<string, number>());
  if (!lines.size) return view;
  // The month view is cached and shared: change a copy.
  const v = structuredClone(view);
  const all = [...v.halves[0].entries, ...v.halves[1].entries, ...v.surplusItems, ...(v.periods ?? []).flatMap((p) => p.entries)];
  for (const e of all) {
    const cents = lines.get(e.lineItemId);
    if (cents === undefined || e.year !== year || e.month !== month || e.carriedFrom || e.skipped) continue;
    e.budgetedCents = cents;
    e.adjusted = false;
    e.fromStatement = true;
  }
  for (const h of v.halves) {
    h.budgetedCents = sum(h.entries, (e) => e.budgetedCents);
    h.remainingCents = remaining(h.entries);
  }
  for (const p of v.periods ?? []) {
    p.budgetedCents = sum(p.entries, (e) => e.budgetedCents);
    p.remainingCents = remaining(p.entries);
  }
  v.surplusBudgetedCents = sum(v.surplusItems, (e) => e.budgetedCents);
  const remainingFirst = v.halves[0].remainingCents + v.carriedCents;
  const remainingBoth = remainingFirst + v.halves[1].remainingCents;
  v.totalBudgetedCents = v.halves[0].budgetedCents + v.halves[1].budgetedCents;
  v.totalRemainingCents = remainingBoth;
  v.transferAfterFirstCents = v.billsBalanceCents === null ? null : v.billsBalanceCents - remainingFirst;
  v.transferAfterSecondCents = v.billsBalanceCents === null ? null : v.billsBalanceCents - remainingBoth;
  return v;
}
