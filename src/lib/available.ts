/**
 * Available to spend: the most that can go out today without any later bill coming up short.
 *
 * It starts from the worst-case carry-over (checking plus this month's pay still coming, less
 * every bill still due, the debt payment, every card balance and the rest of this month's
 * budgets), then walks next month's pay and bills in date order up to the day before the paycheck
 * that starts the next stretch. Money spent now lowers every later balance, so what's available is
 * the lowest point along the way: spend more and the bill at that point can't be paid.
 */

export interface AvailableEvent {
  date: string;
  name: string;
  /** Positive for pay, negative for a bill. */
  cents: number;
}

export interface Available {
  /** Never below zero. */
  cents: number;
  /** How far short the lowest point already is (0 when it isn't). */
  shortCents: number;
  /** Good through this day: after it, the next paycheck changes the picture. */
  until: string;
  /** Where the lowest point is: null when it's the carry-over itself (end of this month). */
  limit: AvailableEvent | null;
  /** In checking the day before the next stretch, as things stand. */
  endCents: number;
}

export function available(input: { startCents: number; events: AvailableEvent[]; until: string }): Available {
  const events = [...input.events].sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents || a.name.localeCompare(b.name));
  let balance = input.startCents;
  let low = balance;
  let limit: AvailableEvent | null = null;
  for (const e of events) {
    balance += e.cents;
    if (balance < low) {
      low = balance;
      limit = e;
    }
  }
  return { cents: Math.max(0, low), shortCents: Math.max(0, -low), until: input.until, limit, endCents: balance };
}
