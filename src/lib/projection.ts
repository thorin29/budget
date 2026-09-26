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
 */

import { addDays, stripTime, type Obligation } from "./month-model";

// ---------------------------------------------------------------- types

export interface ExpectedIncome {
  lineItemId: string;
  name: string;
  date: Date;
  /** The estimate for this specific payday — the default, or an adjustment. */
  amount: number;
}

export interface ProjectionInput {
  /** Balance in the bills account right now. */
  openingBalance: number;
  /** As-of date for that balance. Defaults to today. */
  asOf?: Date;
  /** Unpaid obligations, including carried-over ones. */
  obligations: Obligation[];
  /** Expected paydays and amounts inside the horizon. */
  income: ExpectedIncome[];
  /** Days to project. Default 45 — one full bill cycle plus a payday. */
  horizonDays?: number;
  /** Optional floor to keep in the account. Zero unless deliberately set. */
  buffer?: number;
  /** A hypothetical payment to test, e.g. a card payment being considered. */
  proposedPayment?: { amount: number; date?: Date };
}

export interface ProjectionDay {
  date: Date;
  /** Money out on this date. */
  out: number;
  /** Money in on this date. */
  in: number;
  /** Closing balance for the day. */
  balance: number;
  events: Array<{ name: string; amount: number; kind: "bill" | "income" | "proposed" }>;
}

export interface Projection {
  asOf: Date;
  horizonEnd: Date;
  openingBalance: number;
  days: ProjectionDay[];
  /** The lowest closing balance across the horizon, and when it occurs. */
  lowPoint: { date: Date; balance: number };
  /** Headroom above the buffer at the low point — what is safe to send out. */
  safeToPay: number;
  /** Total due before the next expected paycheck. */
  committedBeforeNextPay: number;
  /** The next payday inside the horizon, if any. */
  nextPayDate: Date | null;
  /** True if the balance goes negative at any point. */
  shortfall: boolean;
}

// ---------------------------------------------------------------- engine

export function project({
  openingBalance,
  asOf = new Date(),
  obligations,
  income,
  horizonDays = 45,
  buffer = 0,
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
      entry = { date: d, out: 0, in: 0, balance: 0, events: [] };
      byDay.set(key, entry);
    }
    return entry;
  };

  for (const o of obligations) {
    const d = effectiveDate(o.dueDate);
    if (d > end) continue;
    const entry = ensure(d);
    entry.out += o.amount;
    entry.events.push({ name: o.name, amount: -o.amount, kind: "bill" });
  }

  for (const i of income) {
    const d = stripTime(i.date);
    if (d < start || d > end) continue;
    const entry = ensure(d);
    entry.in += i.amount;
    entry.events.push({ name: i.name, amount: i.amount, kind: "income" });
  }

  if (proposedPayment && proposedPayment.amount > 0) {
    const d = stripTime(proposedPayment.date ?? start);
    if (d <= end) {
      const entry = ensure(d);
      entry.out += proposedPayment.amount;
      entry.events.push({
        name: "Proposed payment",
        amount: -proposedPayment.amount,
        kind: "proposed",
      });
    }
  }

  const days = [...byDay.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  let running = openingBalance;
  let lowBalance = openingBalance;
  let lowDate = start;

  for (const day of days) {
    running = running + day.in - day.out;
    day.balance = running;
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

  const committedBeforeNextPay = nextPayDate
    ? obligations
        .filter((o) => effectiveDate(o.dueDate) < nextPayDate)
        .reduce((sum, o) => sum + o.amount, 0)
    : obligations
        .filter((o) => effectiveDate(o.dueDate) <= end)
        .reduce((sum, o) => sum + o.amount, 0);

  return {
    asOf: start,
    horizonEnd: end,
    openingBalance,
    days,
    lowPoint: { date: lowDate, balance: lowBalance },
    safeToPay: Math.max(0, lowBalance - buffer),
    committedBeforeNextPay,
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
export function maxSafePayment(input: ProjectionInput): number {
  const base = project({ ...input, proposedPayment: undefined });
  return base.safeToPay;
}
