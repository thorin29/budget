/**
 * Spending envelopes. Pure: the server gathers the numbers.
 *
 * Each pay period's income is handed out in a fixed order, each step protected
 * from the ones after it: bills, then essentials, then planned spending, then
 * the debt payment, and what's left is one shared pot of flexible money split
 * into envelopes. Categories sit inside groups; a group is an envelope.
 *
 * No envelope goes negative. When one runs over, the overage comes out of the
 * flexible envelopes that still have room, each giving in proportion to its
 * room. Essentials that run over draw on flexible money the same way. When
 * the flexible pot is empty, the shortfall is reported: it would come out of
 * the debt payment, or sit on a card that can't be paid in full.
 *
 * Limits are automatic unless set: essentials and planned groups take their
 * usual amount, and flexible groups share what's left in proportion to their
 * usual amounts (never more than usual; the rest is extra for debt). Setting
 * one limit by hand leaves the automatic ones to share the remainder, which
 * is how changing one moves the others.
 */

export type Tier = "ESSENTIAL" | "PLANNED" | "FLEXIBLE";
/** How a group is stored: a tier, or BILLS for categories paid through the plan's bills. */
export type GroupTier = Tier | "BILLS";
export const TIERS: Tier[] = ["ESSENTIAL", "PLANNED", "FLEXIBLE"];

export interface LimitGroup {
  id: string;
  tier: Tier;
  /** Set by the person, per pay period; null for automatic. */
  manualCents: number | null;
  /** Usual spending per pay period. */
  averageCents: number;
}

export interface Limits {
  limits: Map<string, number>;
  /** The flexible pot: income less bills, debt payment, essentials and planned. */
  flexibleCents: number;
  /** Flexible money no envelope needed: extra for debt. */
  unassignedCents: number;
  /** Positive when the steps before flexible already need more than the income. */
  shortCents: number;
}

export function assignLimits(input: { incomeCents: number; billsCents: number; debtCents: number; groups: LimitGroup[] }): Limits {
  const limits = new Map<string, number>();
  let before = 0;
  for (const g of input.groups) {
    if (g.tier === "FLEXIBLE") continue;
    const v = Math.max(0, g.manualCents ?? g.averageCents);
    limits.set(g.id, v);
    before += v;
  }
  const pot = input.incomeCents - input.billsCents - input.debtCents - before;
  const flexible = input.groups.filter((g) => g.tier === "FLEXIBLE");
  const manual = flexible.filter((g) => g.manualCents !== null);
  const auto = flexible.filter((g) => g.manualCents === null);
  let manualTotal = 0;
  for (const g of manual) {
    const v = Math.max(0, g.manualCents!);
    limits.set(g.id, v);
    manualTotal += v;
  }
  const rest = Math.max(0, pot - manualTotal);
  const usual = auto.reduce((s, g) => s + g.averageCents, 0);
  const scale = usual > 0 ? Math.min(1, rest / usual) : 0;
  let given = 0;
  for (const g of auto) {
    const v = Math.round(g.averageCents * scale);
    limits.set(g.id, v);
    given += v;
  }
  return {
    limits,
    flexibleCents: Math.max(0, pot),
    unassignedCents: Math.max(0, rest - given),
    // Only what the set limits ask beyond the pot: a pot already below zero is reported on its own.
    shortCents: Math.max(0, manualTotal - Math.max(0, pot)),
  };
}

export interface EnvelopeIn {
  id: string;
  name: string;
  tier: Tier;
  limitCents: number;
  spentCents: number;
  /** A save-up carries its balance: what was set aside before this period, less what was spent from it. */
  carriedCents?: number;
}

export interface Envelope extends EnvelopeIn {
  /** What can still be spent from it; never negative. */
  leftCents: number;
  /** How far over its own money it has run. */
  overCents: number;
  /** What it gave up to cover other envelopes. */
  gaveCents: number;
}

export interface Shared {
  envelopes: Envelope[];
  /** Flexible money left after covering every overage; negative once the pot is empty. */
  flexibleLeftCents: number;
  /** The overage the flexible pot covered. */
  coveredCents: number;
  /** The overage nothing covered. */
  shortCents: number;
}

/** Shares each overage among the flexible envelopes that still have room. */
export function share(input: EnvelopeIn[]): Shared {
  const rows: Envelope[] = input.map((e) => {
    const have = e.limitCents + (e.carriedCents ?? 0);
    const room = have - e.spentCents;
    return { ...e, leftCents: Math.max(0, room), overCents: Math.max(0, -room), gaveCents: 0 };
  });
  const need = rows.reduce((s, r) => s + r.overCents, 0);
  // A save-up's balance is spoken for; only plain flexible envelopes give.
  const givers = rows.filter((r) => r.tier === "FLEXIBLE" && r.carriedCents === undefined && r.leftCents > 0);
  const room = givers.reduce((s, r) => s + r.leftCents, 0);
  const taken = Math.min(need, room);
  if (taken > 0) {
    let handed = 0;
    givers.forEach((g, i) => {
      const part = i === givers.length - 1 ? taken - handed : Math.min(g.leftCents, Math.round((taken * g.leftCents) / room));
      g.gaveCents = part;
      g.leftCents -= part;
      handed += part;
    });
  }
  return { envelopes: rows, flexibleLeftCents: room - need, coveredCents: taken, shortCents: need - taken };
}

/** What a purchase would do: the same envelopes with `cents` more spent from one of them. */
export function whatIf(input: EnvelopeIn[], id: string, cents: number): Shared {
  return share(input.map((e) => (e.id === id ? { ...e, spentCents: e.spentCents + Math.max(0, cents) } : e)));
}

export type Standing = "ok" | "low" | "empty" | "short";

/** One word for the headline. "low" is under a fifth of the pot left. */
export function standing(shared: Shared, flexibleCents: number): Standing {
  if (shared.shortCents > 0) return "short";
  if (shared.flexibleLeftCents <= 0) return "empty";
  return flexibleCents > 0 && shared.flexibleLeftCents < flexibleCents / 5 ? "low" : "ok";
}

export const PERIODS_PER_YEAR = { WEEKLY: 52, BIWEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12 } as const;

/**
 * What an envelope carries into this pay period from the ones before it.
 * Essentials and planned spending come in lumps (a doctor's bill, school
 * fees), so what a period doesn't use stays in the envelope, up to `capCents`;
 * an overage was already covered at the time and isn't carried. A save-up
 * keeps everything and can run behind (no cap, no floor).
 */
export function carried(limitCents: number, spentByPeriod: number[], capCents: number | null): number {
  let have = 0;
  for (const spent of spentByPeriod) {
    have += limitCents - spent;
    if (capCents !== null) have = Math.min(capCents, Math.max(0, have));
  }
  return have;
}

export interface Totals {
  /** What's left in every envelope, less any overage nothing covered. */
  leftCents: number;
  /** Overage nothing covered: spending past what the period had. */
  overCents: number;
  byTier: Record<Tier, { leftCents: number; overCents: number }>;
}

/** The summary across every envelope, and per tier. */
export function totals(shared: Shared): Totals {
  const byTier = { ESSENTIAL: { leftCents: 0, overCents: 0 }, PLANNED: { leftCents: 0, overCents: 0 }, FLEXIBLE: { leftCents: 0, overCents: 0 } };
  for (const e of shared.envelopes) {
    byTier[e.tier].leftCents += e.leftCents;
    byTier[e.tier].overCents += e.overCents;
  }
  const left = shared.envelopes.reduce((s, e) => s + e.leftCents, 0);
  return { leftCents: left - shared.shortCents, overCents: shared.shortCents, byTier };
}

/** A monthly amount as its share of one pay period. */
export function perPeriod(monthlyCents: number, periodsPerYear: number): number {
  return Math.round((monthlyCents * 12) / periodsPerYear);
}

/** When a balance is cleared, paying `perPeriodCents` each period of `periodDays`. Null when nothing is paid. */
export function payoffDate(balanceCents: number, perPeriodCents: number, periodDays: number, today: string): string | null {
  if (balanceCents <= 0) return today;
  if (perPeriodCents <= 0) return null;
  const periods = Math.ceil(balanceCents / perPeriodCents);
  return new Date(Date.parse(`${today}T00:00:00Z`) + periods * periodDays * 86_400_000).toISOString().slice(0, 10);
}
