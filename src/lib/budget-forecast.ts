/**
 * Where each budget is heading by the end of the month, and what that does to the checking
 * cushion. Pure: the server gathers the numbers.
 *
 * Forecast: what's spent so far, carried at the same daily rate to the month's last day. A
 * budget made of one monthly charge (one charge this month, close to its usual month) counts
 * once instead. A closed month forecasts what was spent. Unplanned costs come in lumps, so
 * they count as spent and aren't forecast.
 */

export interface ForecastGroup {
  id: string;
  name: string;
  tier: "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED" | "SORT";
  spentCents: number;
  limitCents: number | null;
  usualCents: number;
  /** Charges this month. */
  charges: number;
}

export interface ForecastRow {
  id: string;
  name: string;
  tier: ForecastGroup["tier"];
  spentCents: number;
  limitCents: number | null;
  forecastCents: number;
  /** Budget minus forecast: under when positive, over when negative; null without a budget. */
  marginCents: number | null;
  monthly: boolean;
}

export function forecastGroups(groups: ForecastGroup[], day: number, daysInMonth: number, closed: boolean): ForecastRow[] {
  const share = Math.min(1, Math.max(1, day) / daysInMonth);
  return groups.map((g) => {
    const budgeted = g.tier === "ESSENTIAL" || g.tier === "FLEXIBLE";
    const monthly = budgeted && g.charges === 1 && g.usualCents > 0 && Math.abs(g.spentCents - g.usualCents) <= g.usualCents * 0.25;
    const forecastCents = closed || !budgeted || monthly ? g.spentCents : Math.round(g.spentCents / share);
    const limit = budgeted ? g.limitCents : null;
    return { id: g.id, name: g.name, tier: g.tier, spentCents: g.spentCents, limitCents: limit, forecastCents, marginCents: limit === null ? null : limit - forecastCents, monthly };
  });
}

export interface Totals {
  spentCents: number;
  /** Essentials and Extras budgets. */
  budgetCents: number;
  /** Budgeted spending at its forecast, plus unplanned so far. */
  forecastCents: number;
  /** Unplanned and unsorted so far. */
  unplannedCents: number;
  marginCents: number;
}

export function forecastTotals(rows: ForecastRow[]): Totals {
  const budgeted = rows.filter((r) => r.tier === "ESSENTIAL" || r.tier === "FLEXIBLE");
  const other = rows.filter((r) => r.tier === "UNPLANNED" || r.tier === "SORT");
  const budgetCents = budgeted.reduce((t, r) => t + (r.limitCents ?? 0), 0);
  const unplannedCents = other.reduce((t, r) => t + r.spentCents, 0);
  const forecastCents = budgeted.reduce((t, r) => t + r.forecastCents, 0) + unplannedCents;
  return { spentCents: rows.reduce((t, r) => t + r.spentCents, 0), budgetCents, forecastCents, unplannedCents, marginCents: budgetCents - forecastCents };
}

export interface Cushion {
  /** Checking once every card and bill is paid, at the start of the month. */
  startCents: number;
  /** The same at the end of the month, at the forecast. */
  endCents: number;
  /** End minus start: the month's income less everything out. */
  changeCents: number;
  /** A month later, if next month goes the same way. */
  nextCents: number;
  /** Months until it reaches the minimum at this rate; null when it isn't shrinking. */
  monthsLeft: number | null;
}

/**
 * [carryNowCents]: checking plus this month's pay still coming, less every card balance, bill
 * still due and the debt payment. [forecastLeftCents]: budgeted spending still forecast this
 * month. [monthNetCents]: the month's income less its bills, debt payment and forecast spending.
 */
export function cushion(carryNowCents: number, forecastLeftCents: number, monthNetCents: number, minimumCents: number): Cushion {
  const endCents = carryNowCents - forecastLeftCents;
  const startCents = endCents - monthNetCents;
  const room = endCents - minimumCents;
  return {
    startCents,
    endCents,
    changeCents: monthNetCents,
    nextCents: endCents + monthNetCents,
    monthsLeft: monthNetCents < 0 ? Math.max(0, Math.floor(room / -monthNetCents)) : null,
  };
}
