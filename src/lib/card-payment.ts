/**
 * What a card needs paid, worked out from its balance, its transactions and
 * the two days on its statement. The feed carries balances and transactions
 * only, so the statement balance is rebuilt: the balance now, less what posted
 * after the last closing day.
 *
 *  - Pay the statement in full when the card charges interest.
 *  - With a 0% offer, pay the balance off in equal payments by the end of the
 *    offer, so nothing is left when the rate goes up.
 */

export interface CardInput {
  /** Negative is owed, as the feed reports it. */
  balanceCents: number;
  closeDay: number;
  dueDay: number;
  /** YYYY-MM-DD. */
  promoEndsOn: string | null;
  /** Transactions posted since shortly before the last closing day. Negative is a charge. */
  txns: Array<{ postedOn: string; amountCents: number }>;
  /** YYYY-MM-DD. */
  today: string;
}

export interface CardStatus {
  lastClose: string;
  nextDue: string;
  /** Owed when the statement closed. */
  statementCents: number;
  /** Payments and credits since it closed. */
  paidSinceCents: number;
  /** Left of the statement to pay by the due date. */
  dueCents: number;
  owedNowCents: number;
  suggestedCents: number;
  plan: "statement" | "payoff" | "paid";
  /** With a 0% offer: payments left until it ends, including this one. */
  paymentsLeft: number | null;
  /** With a 0% offer: the equal monthly payment that clears it. */
  monthlyCents: number | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const last = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const on = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(d, last(y, m)))}`;
const shift = (y: number, m: number, by: number) => {
  const n = y * 12 + (m - 1) + by;
  return [Math.floor(n / 12), (n % 12) + 1] as const;
};

/** The latest closing date on or before today. */
export function lastCloseDate(today: string, closeDay: number): string {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const here = on(y, m, closeDay);
  if (here <= today) return here;
  const [py, pm] = shift(y, m, -1);
  return on(py, pm, closeDay);
}

/** The first due date after a closing date. */
export function dueAfter(close: string, dueDay: number): string {
  const [y, m] = [Number(close.slice(0, 4)), Number(close.slice(5, 7))];
  const here = on(y, m, dueDay);
  if (here > close) return here;
  const [ny, nm] = shift(y, m, 1);
  return on(ny, nm, dueDay);
}

/** Due dates from `first` through `end`, inclusive, one a month. */
export function dueDatesThrough(first: string, end: string, dueDay: number): number {
  let count = 0;
  let [y, m] = [Number(first.slice(0, 4)), Number(first.slice(5, 7))];
  for (let date = on(y, m, dueDay); date <= end && count < 240; ) {
    count += 1;
    [y, m] = shift(y, m, 1);
    date = on(y, m, dueDay);
  }
  return count;
}

export function cardStatus(input: CardInput): CardStatus {
  const lastClose = lastCloseDate(input.today, input.closeDay);
  const nextDue = dueAfter(lastClose, input.dueDay);
  const after = input.txns.filter((t) => t.postedOn > lastClose);
  const owedNowCents = Math.max(0, -input.balanceCents);
  const netAfter = after.reduce((s, t) => s + t.amountCents, 0);
  const statementCents = Math.max(0, owedNowCents + netAfter);
  const paidSinceCents = after.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0);
  const dueCents = Math.max(0, statementCents - paidSinceCents);

  let paymentsLeft: number | null = null;
  let monthlyCents: number | null = null;
  let plan: CardStatus["plan"] = dueCents > 0 ? "statement" : "paid";
  let suggestedCents = dueCents;
  if (input.promoEndsOn && input.promoEndsOn >= nextDue && statementCents > 0) {
    paymentsLeft = dueDatesThrough(nextDue, input.promoEndsOn, input.dueDay);
    monthlyCents = Math.ceil(statementCents / paymentsLeft);
    suggestedCents = Math.max(0, monthlyCents - paidSinceCents);
    plan = suggestedCents > 0 ? "payoff" : "paid";
  }
  return { lastClose, nextDue, statementCents, paidSinceCents, dueCents, owedNowCents, suggestedCents, plan, paymentsLeft, monthlyCents };
}
