/**
 * One month's portion of a card statement (see src/server/statement-plan.ts). Pure.
 *
 *  - "left": the end of a month that has started. Each budget's limit less what was spent before
 *    the portion (every account), at this card's share, pooled by section and never below zero.
 *  - "days": the start of a month, or a month still to come. The limits by days.
 * The reserve follows the same rule, when the card is its home.
 */

export interface PortionBudget {
  id: string;
  tier: "ESSENTIAL" | "FLEXIBLE";
  limitCents: number;
  /** This card's share of the budget's spending, 0–1. */
  share: number;
}

export interface PortionInput {
  rule: "left" | "days";
  budgets: PortionBudget[];
  /** Spent before the portion, every account, by budget ("left" only). */
  before: Map<string, number>;
  /** Days in the portion over days in the month ("days" only). */
  fraction: number;
  /** The reserve when this card is its home, else 0. */
  reserveCents: number;
  /** Unplanned spending before the portion ("left" only). */
  unplannedBeforeCents: number;
}

export interface PortionResult {
  byGroup: Map<string, number>;
  essentialCents: number;
  extrasCents: number;
  reserveCents: number;
}

/** Splits [total] in proportion to the positive [weights], adding up exactly. */
export function spread(total: number, weights: Map<string, number>): Map<string, number> {
  const pos = [...weights].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]);
  const sum = pos.reduce((t, [, w]) => t + w, 0);
  const out = new Map<string, number>();
  if (!pos.length || total <= 0) return out;
  let given = 0;
  pos.forEach(([k, w], i) => {
    if (i === 0) return;
    const v = Math.round((total * w) / sum);
    out.set(k, v);
    given += v;
  });
  out.set(pos[0][0], total - given);
  return out;
}

export function portionBudget(input: PortionInput): PortionResult {
  const byGroup = new Map<string, number>();
  const tiers = { ESSENTIAL: 0, FLEXIBLE: 0 };
  for (const tier of ["ESSENTIAL", "FLEXIBLE"] as const) {
    const parts = new Map<string, number>();
    for (const b of input.budgets.filter((x) => x.tier === tier)) {
      const base = input.rule === "left" ? b.limitCents - (input.before.get(b.id) ?? 0) : b.limitCents * input.fraction;
      parts.set(b.id, base * b.share);
    }
    const total = Math.max(0, Math.round([...parts.values()].reduce((t, v) => t + v, 0)));
    tiers[tier] = total;
    for (const [k, v] of spread(total, parts)) byGroup.set(k, v);
  }
  const reserveCents =
    input.reserveCents <= 0 ? 0 : input.rule === "left" ? Math.max(0, input.reserveCents - input.unplannedBeforeCents) : Math.round(input.reserveCents * input.fraction);
  return { byGroup, essentialCents: tiers.ESSENTIAL, extrasCents: tiers.FLEXIBLE, reserveCents };
}
