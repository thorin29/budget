/**
 * Working out a pay calendar from paycheck deposits, so it fits whatever
 * employer and schedule the person has: weekly, every two weeks (with its
 * three-paycheck months), twice a month, or monthly.
 */

export interface DetectedPay {
  frequency: "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY";
  /** The latest payday, YYYY-MM-DD. */
  latest: string;
  /** SEMI_MONTHLY / MONTHLY: the usual days of the month. */
  daysOfMonth: number[];
  count: number;
}

const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const middle = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** From four or more paycheck dates; null when they don't follow a schedule. */
export function detectPay(dates: string[]): DetectedPay | null {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 4) return null;
  const gaps = sorted.slice(1).map((d, i) => day(d) - day(sorted[i]));
  const gap = middle(gaps);
  const latest = sorted[sorted.length - 1];
  const steady = (target: number, slack: number) => gaps.filter((g) => Math.abs(g - target) <= slack).length >= gaps.length * 0.75;
  if (Math.abs(gap - 7) <= 1 && steady(7, 1)) return { frequency: "WEEKLY", latest, daysOfMonth: [], count: sorted.length };
  // Twice a month lands on the same two days; every two weeks drifts through the month.
  const doms = sorted.map((d) => Number(d.slice(8, 10)));
  if (gap >= 13 && gap <= 17) {
    const vals = doms.map((d) => (d >= 28 ? 31 : d)).sort((x, y) => x - y);
    const tight = (xs: number[]) => xs.length > 0 && Math.max(...xs) - Math.min(...xs) <= 3;
    for (let i = 1; i < vals.length; i += 1) {
      const [first, second] = [vals.slice(0, i), vals.slice(i)];
      if (tight(first) && tight(second)) return { frequency: "SEMI_MONTHLY", latest, daysOfMonth: [middle(first), middle(second)], count: sorted.length };
    }
  }
  if (Math.abs(gap - 14) <= 1 && steady(14, 2)) return { frequency: "BIWEEKLY", latest, daysOfMonth: [], count: sorted.length };
  if (gap >= 27 && gap <= 33) return { frequency: "MONTHLY", latest, daysOfMonth: [middle(doms)], count: sorted.length };
  return null;
}

/** Whether a calendar's paydays line up with the deposits (each within 3 days). */
export function calendarMatches(paydays: string[], deposits: string[]): boolean {
  if (!deposits.length) return true;
  return deposits.every((d) => paydays.some((p) => Math.abs(day(p) - day(d)) <= 3));
}
