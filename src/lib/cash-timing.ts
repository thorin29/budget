/**
 * Cash timing: will checking have the money on each due date? Pure: the
 * server gathers the balance and the dated money in and out.
 *
 * Starting from checking now, each payday adds its pay and each bill, card
 * payment and debt payment takes its whole amount on its due date. The
 * running balance shows the lowest point, and the first day it would go
 * below zero, ahead of time. Each paycheck's list is everything due from its
 * payday up to the next one: what that paycheck has to pay, in whole payments.
 */

export interface CashEvent {
  /** YYYY-MM-DD */
  date: string;
  label: string;
  /** Money in is positive, money out negative. */
  cents: number;
  kind: "pay" | "bill" | "card" | "debt";
  /** The amount is a floor (a card's next statement, still growing). */
  estimate?: boolean;
  /** Was due before today and isn't paid. */
  overdue?: boolean;
}

export interface CashStep extends CashEvent {
  balanceCents: number;
}

export interface PaycheckSpan {
  /** The payday, or today for the days before the first payday. */
  from: string;
  /** The next payday, or the end of the window. */
  to: string;
  /** The paycheck's amount; 0 for the span before the first payday. */
  payCents: number;
  outCents: number;
  items: CashStep[];
  /** In checking just before the next payday. */
  endCents: number;
}

export interface CashTiming {
  startCents: number;
  steps: CashStep[];
  lowCents: number;
  lowOn: string;
  /** The first day checking would be below zero, or null. */
  shortOn: string | null;
  shortCents: number;
  spans: PaycheckSpan[];
}

/** Money in before money out on the same day: a paycheck lands before the bills it pays. */
function order(a: CashEvent, b: CashEvent): number {
  return a.date.localeCompare(b.date) || (a.cents > 0 ? 0 : 1) - (b.cents > 0 ? 0 : 1) || a.label.localeCompare(b.label);
}

export function cashTiming(input: { today: string; until: string; startCents: number; events: CashEvent[] }): CashTiming {
  const events = input.events
    .map((e) => (e.date < input.today ? { ...e, date: input.today, overdue: e.kind !== "pay" ? true : e.overdue } : e))
    .filter((e) => e.date <= input.until && e.cents !== 0)
    .sort(order);
  let balance = input.startCents;
  let lowCents = balance;
  let lowOn = input.today;
  let shortOn: string | null = balance < 0 ? input.today : null;
  const steps: CashStep[] = events.map((e) => {
    balance += e.cents;
    if (balance < lowCents) [lowCents, lowOn] = [balance, e.date];
    if (balance < 0 && shortOn === null) shortOn = e.date;
    return { ...e, balanceCents: balance };
  });

  // Paycheck spans: today up to the first payday, then payday to payday.
  const paydays = steps.filter((s) => s.kind === "pay");
  const starts = [input.today, ...paydays.map((p) => p.date)].filter((d, i, a) => a.indexOf(d) === i);
  const spans: PaycheckSpan[] = starts.map((from, i) => {
    const to = starts[i + 1] ?? input.until;
    const inSpan = steps.filter((s) => s.date >= from && (s.date < to || (!starts[i + 1] && s.date <= to)));
    const items = inSpan.filter((s) => s.cents < 0);
    const before = steps.filter((s) => s.date < from);
    const startBalance = before.length ? before[before.length - 1].balanceCents : input.startCents;
    const last = inSpan.length ? inSpan[inSpan.length - 1].balanceCents : startBalance;
    return {
      from,
      to,
      payCents: inSpan.filter((s) => s.kind === "pay").reduce((t, s) => t + s.cents, 0),
      outCents: items.reduce((t, s) => t - s.cents, 0),
      items,
      endCents: last,
    };
  });

  return { startCents: input.startCents, steps, lowCents, lowOn, shortOn, shortCents: Math.max(0, -lowCents), spans };
}
