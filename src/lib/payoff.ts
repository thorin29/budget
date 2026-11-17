/**
 * What's left on a bill that pays off a balance, how many payments that is,
 * and when the last one lands. Pure: the server gathers the numbers.
 *
 * The balance comes from a loan account in the bank feed when one is linked
 * (it already counts interest), else from a balance as of a date less the
 * payments recorded since (exact for 0% plans like an orthodontist; for a
 * loan with interest, update the balance now and then).
 */

export interface PayoffInput {
  /** From a linked loan account, owed as a positive amount. */
  accountBalanceCents: number | null;
  /** Balance typed in, as of `asOf`. */
  balanceCents: number | null;
  /** YYYY-MM-DD */
  asOf: string | null;
  /** Payments recorded for the bill: the date paid (or the month's 1st) and amount. */
  payments: Array<{ paidOn: string; cents: number; year: number; month: number }>;
  plannedCents: number;
  /** Months of the year the bill is due, 1-12. */
  months: number[];
  /** Today, YYYY-MM-DD. */
  today: string;
}

export interface PayoffStatus {
  source: "bank" | "balance";
  remainingCents: number;
  paidOff: boolean;
  /** Null without a usual amount. */
  paymentsLeft: number | null;
  /** The month the last payment is due. */
  lastYear: number | null;
  lastMonth: number | null;
  /** The month of the latest payment recorded, for ending a paid-off bill. */
  latestPaidYear: number | null;
  latestPaidMonth: number | null;
}

export function payoffStatus(input: PayoffInput): PayoffStatus | null {
  if (input.accountBalanceCents === null && input.balanceCents === null) return null;
  const source = input.accountBalanceCents !== null ? "bank" : "balance";
  const since = input.asOf ?? "0000-00-00";
  const paidSince = input.payments.filter((p) => p.paidOn > since).reduce((s, p) => s + p.cents, 0);
  const remainingCents = Math.max(0, source === "bank" ? input.accountBalanceCents! : input.balanceCents! - paidSince);
  const latest = [...input.payments].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0] ?? null;
  const paymentsLeft = input.plannedCents > 0 ? Math.ceil(remainingCents / input.plannedCents) : null;

  // Count due months from this one (or next, when this one is paid).
  let lastYear: number | null = null;
  let lastMonth: number | null = null;
  if (paymentsLeft && input.months.length) {
    let y = Number(input.today.slice(0, 4));
    let m = Number(input.today.slice(5, 7));
    if (input.payments.some((p) => p.year === y && p.month === m)) [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
    let left = paymentsLeft;
    for (let guard = 0; guard < 600; guard++) {
      if (input.months.includes(m)) {
        left -= 1;
        if (left === 0) {
          [lastYear, lastMonth] = [y, m];
          break;
        }
      }
      [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
    }
  }
  return {
    source,
    remainingCents,
    paidOff: remainingCents === 0,
    paymentsLeft,
    lastYear,
    lastMonth,
    latestPaidYear: latest?.year ?? null,
    latestPaidMonth: latest?.month ?? null,
  };
}
