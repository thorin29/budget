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
  /** The part of each payment that goes to escrow, not the loan. */
  escrowCents?: number | null;
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
  const escrow = Math.max(0, input.escrowCents ?? 0);
  // A typed balance, walked forward through each payment since: interest added, then the payment
  // less escrow taken off (not the whole payment, which would count interest and escrow as paid down).
  const r = input.aprBps && input.aprBps > 0 ? input.aprBps / 10_000 / 12 : 0;
  let walked = input.balanceCents ?? 0;
  for (const p of input.payments.filter((p) => p.paidOn > since).sort((a, b) => a.paidOn.localeCompare(b.paidOn))) walked = Math.max(0, walked + Math.round(walked * r) - Math.max(0, p.cents - escrow));
  const remainingCents = Math.max(0, source === "bank" ? input.accountBalanceCents! : walked);
  const latest = [...input.payments].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0] ?? null;
  const { paymentsLeft, neverEnds, interestLeftCents } = paymentsFor(remainingCents, Math.max(0, input.plannedCents - escrow), input.aprBps ?? null);

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

/**
 * The balance month by month at this payment and rate, from today until it reaches zero (at
 * most 40 years). The first point is today; then one at the end of each month, this one first.
 */
export function payoffSchedule(balanceCents: number, paymentCents: number, aprBps: number | null, today: string): Array<{ date: string; cents: number }> {
  const out = [{ date: today, cents: Math.max(0, balanceCents) }];
  if (balanceCents <= 0 || paymentCents <= 0) return out;
  const r = aprBps && aprBps > 0 ? aprBps / 10_000 / 12 : 0;
  let owed = balanceCents;
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  for (let k = 1; owed > 0 && k <= 480; k++) {
    const interest = Math.round(owed * r);
    if (paymentCents <= interest) break;
    owed = Math.max(0, owed + interest - paymentCents);
    // Each payment at the end of its month, this month first (the same count as the payoff date).
    out.push({ date: new Date(Date.UTC(y, m - 1 + k, 0)).toISOString().slice(0, 10), cents: owed });
  }
  return out;
}
