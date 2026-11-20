/**
 * Checking's timing in both cases, the one source for the Cash and Calendar tabs and the saved
 * forecasts. Worst case = this month's Essentials and Extras budgets get used in full on the cards
 * (as on the Overview's Outlook); best case = only what's charged so far.
 */

import { prisma } from "@/lib/prisma";
import { getMonthPlan } from "./month-plan";
import { getCashTiming, worstCase, type CashTimingView } from "./cash-timing";
import { budgetLeftOf } from "./plan-charts";
import { cushionSetting } from "./envelopes";

export interface CashCases {
  best: CashTimingView;
  worst: CashTimingView;
  budgetLeftCents: number;
  cushionCents: number;
}

export async function cashCases(): Promise<CashCases | null> {
  const plan = await getMonthPlan().catch(() => null);
  const [best, cushionCents] = await Promise.all([getCashTiming(plan?.debt.cents ?? 0).catch((error: unknown) => (console.error("Cash timing:", error), null)), cushionSetting()]);
  if (!best) return null;
  const budgetLeftCents = plan ? budgetLeftOf(plan) : 0;
  return { best, worst: worstCase(best, budgetLeftCents), budgetLeftCents, cushionCents };
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Checking at the end of each day from today through the window's last day. */
export function endOfDay(c: CashTimingView): Map<string, number> {
  const out = new Map<string, number>();
  let k = 0;
  let bal = c.startCents;
  for (let t = at(c.today); t <= at(c.until); t += DAY) {
    const d = iso(t);
    while (k < c.steps.length && c.steps[k].date <= d) bal = c.steps[k++].balanceCents;
    out.set(d, bal);
  }
  return out;
}

/** Saves today's forecast (replacing an earlier run today) and drops ones older than about four months. */
export async function recordForecast(): Promise<void> {
  const c = await cashCases();
  if (!c || c.best.missing) return;
  const best = endOfDay(c.best);
  const worst = endOfDay(c.worst);
  const takenOn = new Date(`${c.best.today}T00:00:00Z`);
  await prisma.$transaction([
    prisma.forecastPoint.deleteMany({ where: { takenOn } }),
    prisma.forecastPoint.createMany({
      data: [...best].map(([d, b]) => ({ takenOn, forDate: new Date(`${d}T00:00:00Z`), bestCents: b, worstCents: worst.get(d) ?? b })),
    }),
    prisma.forecastPoint.deleteMany({ where: { takenOn: { lt: new Date(at(c.best.today) - 130 * DAY) } } }),
  ]);
}

export interface PastForecast {
  /** When the forecast was made. */
  takenOn: string;
  bestCents: number;
  worstCents: number;
}

/**
 * For each day from `from` to `to`, the forecast made [lagDays] or more before it (the latest
 * such one, if it's no more than a week older than that).
 */
export async function pastForecasts(from: string, to: string, lagDays = 7): Promise<Map<string, PastForecast>> {
  const rows = (await prisma.forecastPoint
    .findMany({
      where: { forDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: { takenOn: true, forDate: true, bestCents: true, worstCents: true },
    })
    .catch(() => [])) as Array<{ takenOn: Date; forDate: Date; bestCents: number; worstCents: number }>;
  const out = new Map<string, PastForecast>();
  for (const r of rows) {
    const d = iso(r.forDate.getTime());
    const taken = iso(r.takenOn.getTime());
    const gap = (r.forDate.getTime() - r.takenOn.getTime()) / DAY;
    if (gap < lagDays || gap > lagDays + 7) continue;
    const had = out.get(d);
    if (!had || taken > had.takenOn) out.set(d, { takenOn: taken, bestCents: r.bestCents, worstCents: r.worstCents });
  }
  return out;
}
