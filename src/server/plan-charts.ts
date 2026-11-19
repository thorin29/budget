/**
 * Data for the plan's charts that need more than one month: the recent
 * months against their pools, and the 0% balance over time.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { getMonthPlan, type MonthPlanView } from "./month-plan";
import { payoffTrackers } from "./card-payments";
import { forecastGroups, forecastTotals } from "@/lib/budget-forecast";

/** The Budget tab's projection rows for a month: the one source for "projected spend" anywhere. */
export function planForecastRows(plan: MonthPlanView) {
  return forecastGroups(
    plan.groups.map((g) => ({
      id: g.id,
      name: g.name,
      tier: g.tier,
      spentCents: g.spentCents,
      limitCents: g.limitCents,
      usualCents: g.usualCents,
      charges: g.categories.reduce((t, c) => t + c.transactions.length, 0),
    })),
    Number(plan.today.slice(8, 10)),
    plan.daysInMonth,
    plan.closed,
  );
}

/** The last [count] month plans through the given one, oldest first; months that fail are left out. */
export async function recentPlans(current: MonthPlanView, count: number): Promise<MonthPlanView[]> {
  const y = Number(current.month.slice(0, 4));
  const m = Number(current.month.slice(5, 7));
  const earlier = await Promise.all(
    Array.from({ length: count - 1 }, (_, k) => {
      const d = new Date(Date.UTC(y, m - 1 - (count - 1 - k), 1));
      return getMonthPlan(d.getUTCFullYear(), d.getUTCMonth() + 1).catch(() => null);
    }),
  );
  return [...earlier, current].filter((p): p is MonthPlanView => p !== null);
}

export interface TrendMonth {
  /** YYYY-MM */
  month: string;
  incomeCents: number;
  /** The Bills figure every tab shows: the bill list, card payments and the debt payment left out. */
  billsCents: number;
  /** Charges in a bill category that aren't on the bill list. */
  otherCents: number;
  debtCents: number;
  /** Everyday spending: so far, or for the open month, projected to its end. */
  everydayCents: number;
  /** Everyday spending so far (the same as everydayCents once the month is over). */
  everydaySoFarCents: number;
  unplannedCents: number;
  expensesCents: number;
  /** Income less expenses. */
  netCents: number;
  /** The month is still open, so its everyday spending is projected. */
  projected: boolean;
}

/** A month in the terms every tab uses, with the open month projected the Budget tab's way. */
export function trendMonth(p: MonthPlanView): TrendMonth {
  const projected = !p.closed && p.month === p.today.slice(0, 7);
  const everyday = projected ? forecastTotals(planForecastRows(p)).forecastCents : p.spentCents;
  const unplanned = p.groups.filter((g) => g.tier === "UNPLANNED" || g.tier === "SORT").reduce((t, g) => t + g.spentCents, 0);
  const expenses = p.bills.listCents + p.bills.otherCents + p.debt.cents + everyday;
  return {
    month: p.month,
    incomeCents: p.income.totalCents,
    billsCents: p.bills.listCents,
    otherCents: p.bills.otherCents,
    debtCents: p.debt.cents,
    everydayCents: everyday,
    everydaySoFarCents: p.spentCents,
    unplannedCents: unplanned,
    expensesCents: expenses,
    netCents: p.income.totalCents - expenses,
    projected,
  };
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => Date.parse(`${s}T00:00:00Z`);

export interface MonthHistory {
  /** YYYY-MM */
  month: string;
  inCents: number;
  billsCents: number;
  debtCents: number;
  spentCents: number;
  /** Money in less everything out: below zero, the month spent more than it had. */
  netCents: number;
  current: boolean;
}

/** The last [count] months through the current one, by the plan's own definitions. */
export async function planHistory(current: MonthPlanView, count = 6): Promise<MonthHistory[]> {
  const y = Number(current.month.slice(0, 4));
  const m = Number(current.month.slice(5, 7));
  const earlier = await Promise.all(
    Array.from({ length: count - 1 }, (_, k) => {
      const d = new Date(Date.UTC(y, m - 1 - (count - 1 - k), 1));
      return getMonthPlan(d.getUTCFullYear(), d.getUTCMonth() + 1).catch(() => null);
    }),
  );
  return [...earlier, current]
    .filter((p): p is MonthPlanView => p !== null)
    .map((p) => ({
      month: p.month,
      inCents: p.income.totalCents,
      billsCents: p.bills.totalCents,
      debtCents: p.debt.cents,
      spentCents: p.spentCents,
      netCents: p.poolLeftCents,
      current: p.month === current.month && !p.closed,
    }));
}

export interface DebtChart {
  name: string | null;
  endsOn: string;
  balanceCents: number;
  /** Week by week since the balance moved onto the card. */
  points: Array<{ date: string; cents: number }>;
  /** Month by month at this month's payment. */
  projected: Array<{ date: string; cents: number }>;
  /** Month by month at the payment that clears it by the end of the offer. */
  target: Array<{ date: string; cents: number }>;
  monthlyCents: number;
  targetCents: number | null;
}

export async function debtChart(today: string, monthlyCents: number, targetCents: number | null): Promise<DebtChart | null> {
  const trackers = await payoffTrackers(today).catch(() => []);
  if (!trackers.length) return null;
  const ids = trackers.map((t) => t.id);
  const start = trackers.map((t) => t.startOn).filter((d): d is string => !!d).sort()[0] ?? iso(new Date(at(today) - 90 * DAY));
  const rows = (await prisma.bankTransaction.findMany({
    where: { accountId: { in: ids }, postedOn: { gte: new Date(`${start}T00:00:00Z`) }, pending: false },
    select: { postedOn: true, amount: true },
  })) as Array<{ postedOn: Date; amount: { toString(): string } }>;
  const balance = trackers.reduce((s, t) => s + t.balanceCents, 0);
  // Walk back from today's balance: before a charge it was less, before a payment more.
  const points: Array<{ date: string; cents: number }> = [];
  for (let t = at(today); t >= at(start); t -= 7 * DAY) {
    const d = iso(new Date(t));
    const after = rows.filter((r) => iso(r.postedOn) > d).reduce((s, r) => s + toCents(r.amount), 0);
    points.unshift({ date: d, cents: Math.max(0, balance + after) });
  }
  const endsOn = trackers.map((t) => t.endsOn).sort()[0];
  const monthly = (cents: number) => {
    const out = [{ date: today, cents: balance }];
    let owed = balance;
    for (let k = 1; owed > 0 && cents > 0 && k <= 120; k++) {
      owed = Math.max(0, owed - cents);
      const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + k, 1));
      out.push({ date: iso(d), cents: owed });
    }
    return out;
  };
  return {
    name: trackers.length === 1 ? trackers[0].name : "0% balances",
    endsOn,
    balanceCents: balance,
    points,
    projected: monthly(monthlyCents),
    target: targetCents ? monthly(targetCents) : [],
    monthlyCents,
    targetCents,
  };
}
