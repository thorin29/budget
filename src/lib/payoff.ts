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
  /** The interest rate (APR) in hundredths of a percent (6.25% = 625); null or 0 for none known. */
  aprBps?: number | null;
}

export interface PayoffStatus {
  source: "bank" | "balance";
  remainingCents: number;
  paidOff: boolean;
  /** Null without a usual amount, or when the payment doesn't cover the interest. */
  paymentsLeft: number | null;
  /** The payment is less than a month's interest, so the balance never reaches zero. */
  neverEnds: boolean;
  /** Interest still to pay at this payment and rate, when the rate is known. */
  interestLeftCents: number | null;
  /** The month the last payment is due. */
  lastYear: number | null;
  lastMonth: number | null;
  /** The month of the latest payment recorded, for ending a paid-off bill. */
  latestPaidYear: number | null;
  latestPaidMonth: number | null;
}

/**
 * Payments left on a balance: without a rate, the balance over the payment; with one, an
 * amortized loan (monthly interest at APR / 12), and the interest that adds up to.
 */
export function paymentsFor(balanceCents: number, paymentCents: number, aprBps: number | null): { paymentsLeft: number | null; neverEnds: boolean; interestLeftCents: number | null } {
  if (balanceCents <= 0) return { paymentsLeft: 0, neverEnds: false, interestLeftCents: aprBps ? 0 : null };
  if (paymentCents <= 0) return { paymentsLeft: null, neverEnds: false, interestLeftCents: null };
  if (!aprBps || aprBps <= 0) return { paymentsLeft: Math.ceil(balanceCents / paymentCents), neverEnds: false, interestLeftCents: null };
  const r = aprBps / 10_000 / 12;
  if (paymentCents <= balanceCents * r) return { paymentsLeft: null, neverEnds: true, interestLeftCents: null };
  const n = Math.ceil(-Math.log(1 - (r * balanceCents) / paymentCents) / Math.log(1 + r));
  // Walk it to get the interest exactly as the payments would.
  let owed = balanceCents;
  let interest = 0;
  for (let k = 0; k < n && owed > 0; k++) {
    const i = Math.round(owed * r);
    interest += i;
    owed = Math.max(0, owed + i - paymentCents);
  }
  return { paymentsLeft: n, neverEnds: false, interestLeftCents: interest };
}

export function payoffStatus(input: PayoffInput): PayoffStatus | null {
  if (input.accountBalanceCents === null && input.balanceCents === null) return null;
  const source = input.accountBalanceCents !== null ? "bank" : "balance";
  const since = input.asOf ?? "0000-00-00";
  const paidSince = input.payments.filter((p) => p.paidOn > since).reduce((s, p) => s + p.cents, 0);
  const remainingCents = Math.max(0, source === "bank" ? input.accountBalanceCents! : input.balanceCents! - paidSince);
  const latest = [...input.payments].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0] ?? null;
  const { paymentsLeft, neverEnds, interestLeftCents } = paymentsFor(remainingCents, input.plannedCents, input.aprBps ?? null);

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
    neverEnds,
    interestLeftCents,
    lastYear,
    lastMonth,
    latestPaidYear: latest?.year ?? null,
    latestPaidMonth: latest?.month ?? null,
  };
}
