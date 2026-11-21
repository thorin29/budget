/**
 * Stretches of a bill's payments that stayed about the same: three or more payments in a row
 * within a couple of dollars (or 2%) of each other. A mortgage whose escrow changed each year, or
 * that carried an extra principal amount for a while, shows as one stretch per amount. Used to
 * suggest a bill's usual amount and to set past months' budgets to what was really paid.
 */

export interface Payment {
  /** YYYY-MM */
  ym: string;
  cents: number;
}

export interface AmountRun {
  /** First and last month in the stretch, YYYY-MM. */
  from: string;
  to: string;
  /** The months paid in it. */
  months: string[];
  /** The middle payment: what the bill cost in that stretch. */
  cents: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Close enough to count as the same amount. */
export const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(200, Math.round(Math.max(a, b) * 0.02));

/** The stretches, oldest first. Payments that don't belong to one are left out. */
export function amountRuns(payments: Payment[], minLength = 3): AmountRun[] {
  const list = [...payments].filter((p) => p.cents > 0).sort((a, b) => a.ym.localeCompare(b.ym));
  const runs: AmountRun[] = [];
  let cur: Payment[] = [];
  const close = () => {
    if (cur.length >= minLength) runs.push({ from: cur[0].ym, to: cur[cur.length - 1].ym, months: cur.map((p) => p.ym), cents: median(cur.map((p) => p.cents)) });
  };
  for (const p of list) {
    if (cur.length && !sameAmount(p.cents, median(cur.map((x) => x.cents)))) {
      close();
      cur = [];
    }
    cur.push(p);
  }
  close();
  return runs;
}

/** Months from `from` to `to` (YYYY-MM), both included. */
export function monthsFromTo(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

export interface AmountSuggestion {
  /**
   * "steady": the latest payments agree; "drift": the last three keep landing off the budget (the
   * middle of them, rounded up to a dollar); "varies": a bill set as a target whose typical payment
   * moved; or, with no stretch, the last year's average.
   */
  kind: "steady" | "drift" | "varies";
  cents: number;
  /** Steady: the month the stretch began. */
  since: string | null;
  /** How many payments it rests on. */
  count: number;
}

/**
 * What the usual amount should be from the payments, or null when it's already right (within
 * $2 or 2% for a steady bill; 10% and $5 for one that varies). A stretch counts as current when
 * its last payment is the newest one and within two months of `nowYm` (YYYY-MM); otherwise, with
 * six or more payments in the last 12 months, their average.
 */
export function suggestAmount(payments: Payment[], usualCents: number, nowYm: string, target = false): AmountSuggestion | null {
  const paid = payments.filter((p) => p.cents > 0);
  const newestFirst = [...paid].sort((a, b) => b.ym.localeCompare(a.ym));
  const newest = newestFirst[0];
  const middle = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const upToDollar = (c: number) => Math.ceil(c / 100) * 100;
  // A target (water, power): only the typical payment of the last six counts, never one month.
  if (target) {
    const recent = newestFirst.filter((p) => p.ym > shiftYm(nowYm, -7)).slice(0, 6);
    if (recent.length < 3) return null;
    const m = middle(recent.map((p) => p.cents));
    return Math.abs(m - usualCents) > Math.max(500, usualCents * 0.1) ? { kind: "varies", cents: upToDollar(m), since: null, count: recent.length } : null;
  }
  const runs = amountRuns(paid);
  const last = runs[runs.length - 1];
  if (last && newest && last.to === newest.ym && last.to >= shiftYm(nowYm, -2) && last.months.length >= 3) {
    return sameAmount(last.cents, usualCents) ? null : { kind: "steady", cents: last.cents, since: last.from, count: last.months.length };
  }
  // Drift: the last three payments (within four months) land off the budget by more than 5%, and
  // the newest is off the same way. Suggests their middle, rounded up to a dollar.
  const three = newestFirst.filter((p) => p.ym > shiftYm(nowYm, -5)).slice(0, 3);
  if (three.length === 3) {
    const m = middle(three.map((p) => p.cents));
    const off = m - usualCents;
    const newestOff = three[0].cents - usualCents;
    if (Math.abs(off) > Math.max(200, usualCents * 0.05) && Math.sign(off) === Math.sign(newestOff)) {
      return { kind: "drift", cents: upToDollar(m), since: three[2].ym, count: 3 };
    }
  }
  if (last && newest && last.to === newest.ym && last.to >= shiftYm(nowYm, -2)) {
    return sameAmount(last.cents, usualCents) ? null : { kind: "steady", cents: last.cents, since: last.from, count: last.months.length };
  }
  const recent = paid.filter((p) => p.ym > shiftYm(nowYm, -12));
  if (recent.length < 6) return null;
  const avg = Math.round(recent.reduce((t, p) => t + p.cents, 0) / recent.length);
  const off = Math.abs(avg - usualCents);
  return off > 500 && off > usualCents * 0.1 ? { kind: "varies", cents: avg, since: null, count: recent.length } : null;
}

/** YYYY-MM moved by n months. */
export function shiftYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
