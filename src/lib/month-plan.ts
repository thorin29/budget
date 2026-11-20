/**
 * The month's spending plan. Pure: the server gathers the numbers.
 *
 * One month, one pool. The month's bills (and the debt payment) come off the
 * top, whole. What's left is the pool for everything else. Budgets are
 * guardrails inside the pool, not money: what one doesn't spend isn't
 * something to use up, and nothing carries over.
 *
 *   pool            = money in − bills − debt payment
 *   pool left       = pool − everything spent (every kind of budget)
 *   still to come   = for each essential budget, its guardrail less what it
 *                     spent, never below zero: what the household still needs
 *   safe to spend   = pool left − still to come
 *   room            = for a flexible budget, the smaller of its guardrail left
 *                     and safe to spend; never more than the month has
 *
 * An overspend anywhere (an essential, an unplanned repair, an extra) lowers
 * safe to spend, and with it every flexible budget's room, even budgets with
 * no spending. Unplanned budgets have no guardrail of their own. An optional
 * reserve sets money aside for them first; what unplanned spending goes past it
 * comes out of the rest of the pool, lowering every flexible budget's room.
 *
 * Guardrails are set by hand or automatic. Automatic ones start from usual
 * spending; automatic flexible ones are scaled down together so all the
 * guardrails fit in the pool. When even that can't make them fit, the gap is
 * reported rather than hidden.
 */

export type PlanTier = "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED";
/** How a group is stored. PLANNED is an old value, read as UNPLANNED. */
export type GroupTier = PlanTier | "BILLS" | "PLANNED";
export const PLAN_TIERS: PlanTier[] = ["ESSENTIAL", "FLEXIBLE", "UNPLANNED"];

export function planTier(tier: GroupTier): PlanTier | "BILLS" {
  return tier === "PLANNED" ? "UNPLANNED" : tier;
}

export interface PlanGroupIn {
  id: string;
  tier: PlanTier;
  /** Set by the person for the month; null for automatic. Ignored for unplanned. */
  manualCents: number | null;
  /** Usual spending in a month. */
  usualCents: number;
  spentCents: number;
}

export interface PlanGroupOut extends PlanGroupIn {
  /** The month's guardrail; null for unplanned. */
  limitCents: number | null;
  automatic: boolean;
  /** Guardrail less spent, never below zero; null for unplanned. */
  leftCents: number | null;
  /** Spent past the guardrail. */
  overCents: number;
  /** Flexible only: what can still be spent here without the month coming up short. */
  roomCents: number | null;
}

export interface MonthPlanIn {
  incomeCents: number;
  billsCents: number;
  debtCents: number;
  groups: PlanGroupIn[];
  /** The month is over: nothing more is still to come. */
  closed?: boolean;
  /** Set aside for unplanned costs; past it, unplanned spending comes out of the rest of the pool. */
  reserveCents?: number;
}

export interface MonthPlanOut {
  poolCents: number;
  spentCents: number;
  poolLeftCents: number;
  stillToComeCents: number;
  /** Negative is "over by". */
  safeCents: number;
  essentialLimitCents: number;
  flexibleLimitCents: number;
  /** Usual essential and flexible spending past the pool: the guardrails had to shrink this much, or can't fit at all. */
  gapCents: number;
  /** Set guardrails alone add up past the pool by this much. */
  shortCents: number;
  /** Usual unplanned spending in a month, for reference. */
  unplannedUsualCents: number;
  /** The unplanned reserve, what's left of it, and unplanned spending past it (which lowers everyone's room). */
  reserveCents: number;
  reserveLeftCents: number;
  unplannedOverCents: number;
  groups: PlanGroupOut[];
}

export function monthPlan(input: MonthPlanIn): MonthPlanOut {
  const poolCents = input.incomeCents - input.billsCents - input.debtCents;
  const reserveCents = Math.max(0, input.reserveCents ?? 0);
  const unplannedSpent = input.groups.filter((g) => g.tier === "UNPLANNED").reduce((s, g) => s + g.spentCents, 0);
  const reserveLeftCents = Math.max(0, reserveCents - unplannedSpent);
  const limits = new Map<string, number>();

  // Essentials take their set amount, or their usual one.
  let essentialLimitCents = 0;
  for (const g of input.groups) {
    if (g.tier !== "ESSENTIAL") continue;
    const v = Math.max(0, g.manualCents ?? g.usualCents);
    limits.set(g.id, v);
    essentialLimitCents += v;
  }
  // Flexible: set ones as set; automatic ones from usual, scaled down together to fit.
  const flexible = input.groups.filter((g) => g.tier === "FLEXIBLE");
  const setFlex = flexible.filter((g) => g.manualCents !== null);
  const autoFlex = flexible.filter((g) => g.manualCents === null);
  const setTotal = setFlex.reduce((s, g) => s + Math.max(0, g.manualCents!), 0);
  const autoUsual = autoFlex.reduce((s, g) => s + Math.max(0, g.usualCents), 0);
  for (const g of setFlex) limits.set(g.id, Math.max(0, g.manualCents!));
  const roomForAuto = Math.max(0, poolCents - essentialLimitCents - setTotal - reserveCents);
  const scale = autoUsual > 0 ? Math.min(1, roomForAuto / autoUsual) : 0;
  let given = 0;
  autoFlex.forEach((g, i) => {
    // The last one takes the rounding, so the scaled ones add up exactly.
    const v =
      scale >= 1
        ? Math.max(0, g.usualCents)
        : i === autoFlex.length - 1
          ? Math.max(0, Math.min(Math.max(0, g.usualCents), Math.floor(autoUsual * scale) - given))
          : Math.floor(Math.max(0, g.usualCents) * scale);
    limits.set(g.id, v);
    given += v;
  });
  const flexibleLimitCents = flexible.reduce((s, g) => s + (limits.get(g.id) ?? 0), 0);
  const usualNeed = input.groups
    .filter((g) => g.tier !== "UNPLANNED")
    .reduce((s, g) => s + Math.max(0, g.tier === "ESSENTIAL" ? (limits.get(g.id) ?? 0) : g.manualCents ?? g.usualCents), 0);
  const gapCents = Math.max(0, usualNeed + reserveCents - Math.max(0, poolCents));
  const shortCents = Math.max(0, essentialLimitCents + setTotal + reserveCents - Math.max(0, poolCents));

  const spentCents = input.groups.reduce((s, g) => s + g.spentCents, 0);
  const poolLeftCents = poolCents - spentCents;
  const stillToComeCents = input.closed
    ? 0
    : input.groups
        .filter((g) => g.tier === "ESSENTIAL")
        .reduce((s, g) => s + Math.max(0, (limits.get(g.id) ?? 0) - g.spentCents), 0) + reserveLeftCents;
  const safeCents = poolLeftCents - stillToComeCents;

  const groups: PlanGroupOut[] = input.groups.map((g) => {
    if (g.tier === "UNPLANNED") {
      return { ...g, limitCents: null, automatic: false, leftCents: null, overCents: 0, roomCents: null };
    }
    const limitCents = limits.get(g.id) ?? 0;
    const leftCents = Math.max(0, limitCents - g.spentCents);
    return {
      ...g,
      limitCents,
      automatic: g.manualCents === null,
      leftCents,
      overCents: Math.max(0, g.spentCents - limitCents),
      roomCents: g.tier === "FLEXIBLE" ? Math.max(0, Math.min(leftCents, safeCents)) : null,
    };
  });

  return {
    poolCents,
    spentCents,
    poolLeftCents,
    stillToComeCents,
    safeCents,
    essentialLimitCents,
    flexibleLimitCents,
    gapCents,
    shortCents,
    unplannedUsualCents: input.groups.filter((g) => g.tier === "UNPLANNED").reduce((s, g) => s + Math.max(0, g.usualCents), 0),
    reserveCents,
    reserveLeftCents,
    unplannedOverCents: Math.max(0, unplannedSpent - reserveCents),
    groups,
  };
}

/**
 * What some purchases would do: the plan again with them added to their
 * budgets' spending. Budgets not in the plan yet count as flexible with no guardrail.
 */
export function whatIf(input: MonthPlanIn, purchases: Array<{ groupId: string; cents: number }>): MonthPlanOut {
  const extra = new Map<string, number>();
  for (const p of purchases) extra.set(p.groupId, (extra.get(p.groupId) ?? 0) + Math.max(0, p.cents));
  return monthPlan({
    ...input,
    groups: input.groups.map((g) => ({ ...g, spentCents: g.spentCents + (extra.get(g.id) ?? 0) })),
  });
}
