/**
 * Cash runway projection.
 *
 * Walks the bills account forward day by day from today's balance: each unpaid
 * bill comes out on its due date, each expected paycheck goes in on its payday.
 * The lowest balance reached over the horizon is the constraint — anything above
 * it can leave the account today without causing a shortfall later.
 *
 * The horizon deliberately runs past the next payday. Looking only as far as the
 * next check is the trap: it hides the cluster of fixed bills that land at the
 * start of the following month, before that check arrives.
 *
 * All money here is integer cents. See money.ts.
 */

import { addDays, stripTime, type Obligation } from "./month-model";
import type { Cents } from "./money";

// ---------------------------------------------------------------- types

export interface ExpectedIncome {
  lineItemId: string;
  name: string;
  date: Date;
  /** The estimate for this specific payday — the default, or an adjustment. */
  amountCents: Cents;
}

export interface ProjectionInput {
  /** Balance in the bills account right now. */
  openingBalanceCents: Cents;
  /** As-of date for that balance. Defaults to today. */
  asOf?: Date;
  /** Unpaid obligations, including carried-over ones. */
  obligations: Obligation[];
  /** Expected paydays and amounts inside the horizon. */
  income: ExpectedIncome[];
  /** Days to project. Default 45 — one full bill cycle plus a payday. */
  horizonDays?: number;
  /** Optional floor to keep in the account. Zero unless deliberately set. */
  bufferCents?: Cents;
  /** A hypothetical payment to test, e.g. a card payment being considered. */
  proposedPayment?: { amountCents: Cents; date?: Date };
}

export interface ProjectionEvent {
  name: string;
  /** Negative for money out, positive for money in. */
  amountCents: Cents;
  kind: "bill" | "income" | "proposed";
}

export interface ProjectionDay {
  date: Date;
  outCents: Cents;
  inCents: Cents;
  /** Closing balance for the day. */
  balanceCents: Cents;
  events: ProjectionEvent[];
}

export interface Projection {
  asOf: Date;
  horizonEnd: Date;
  openingBalanceCents: Cents;
  days: ProjectionDay[];
  /** The lowest closing balance across the horizon, and when it occurs. */
  lowPoint: { date: Date; balanceCents: Cents };
  /** Headroom above the buffer at the low point — what is safe to send out. */
  safeToPayCents: Cents;
  /** Total due before the next expected paycheck. */
  committedBeforeNextPayCents: Cents;
  /** The next payday inside the horizon, if any. */
  nextPayDate: Date | null;
  /** True if the balance goes negative at any point. */
  shortfall: boolean;
}

// ---------------------------------------------------------------- engine

export function project({
  openingBalanceCents,
  asOf = new Date(),
  obligations,
  income,
  horizonDays = 45,
  bufferCents = 0,
  proposedPayment,
}: ProjectionInput): Projection {
  const start = stripTime(asOf);
  const end = addDays(start, horizonDays);

  // An overdue bill is owed now, not on a date already past, so it lands on the
  // opening day rather than falling outside the window.
  const effectiveDate = (d: Date): Date => {
    const day = stripTime(d);
    return day < start ? start : day;
  };

  const byDay = new Map<number, ProjectionDay>();

  const ensure = (d: Date): ProjectionDay => {
    const key = d.getTime();
    let entry = byDay.get(key);
    if (!entry) {
      entry = { date: d, outCents: 0, inCents: 0, balanceCents: 0, events: [] };
      byDay.set(key, entry);
    }
    return entry;
  };

  for (const o of obligations) {
    const d = effectiveDate(o.dueDate);
    if (d > end) continue;
    const entry = ensure(d);
    entry.outCents += o.amountCents;
    entry.events.push({ name: o.name, amountCents: -o.amountCents, kind: "bill" });
  }

  for (const i of income) {
    const d = stripTime(i.date);
    if (d < start || d > end) continue;
    const entry = ensure(d);
    entry.inCents += i.amountCents;
    entry.events.push({ name: i.name, amountCents: i.amountCents, kind: "income" });
  }

  if (proposedPayment && proposedPayment.amountCents > 0) {
    const d = stripTime(proposedPayment.date ?? start);
    if (d <= end) {
      const entry = ensure(d);
      entry.outCents += proposedPayment.amountCents;
      entry.events.push({
        name: "Proposed payment",
        amountCents: -proposedPayment.amountCents,
        kind: "proposed",
      });
    }
  }

  const days = [...byDay.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  let running = openingBalanceCents;
  let lowBalance = openingBalanceCents;
  let lowDate = start;

  for (const day of days) {
    running = running + day.inCents - day.outCents;
    day.balanceCents = running;
    if (running < lowBalance) {
      lowBalance = running;
      lowDate = day.date;
    }
  }

  const nextPayDate =
    income
      .map((i) => stripTime(i.date))
      .filter((d) => d >= start && d <= end)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const committedBeforeNextPayCents = nextPayDate
    ? obligations
        .filter((o) => effectiveDate(o.dueDate) < nextPayDate)
        .reduce((sum, o) => sum + o.amountCents, 0)
    : obligations
        .filter((o) => effectiveDate(o.dueDate) <= end)
        .reduce((sum, o) => sum + o.amountCents, 0);

  return {
    asOf: start,
    horizonEnd: end,
    openingBalanceCents,
    days,
    lowPoint: { date: lowDate, balanceCents: lowBalance },
    safeToPayCents: Math.max(0, lowBalance - bufferCents),
    committedBeforeNextPayCents,
    nextPayDate,
    shortfall: lowBalance < 0,
  };
}

/**
 * The largest payment that can go out today while keeping the projected low
 * point at or above the buffer. Equivalent to `safeToPay` on a projection with
 * no proposed payment, exposed separately because it is the number the UI leads
 * with and the one that replaces doing this by hand.
 */
export function maxSafePaymentCents(input: ProjectionInput): Cents {
  return project({ ...input, proposedPayment: undefined }).safeToPayCents;
}
