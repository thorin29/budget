/**
 * Extra income: money that isn't in a normal month, so the budgets don't count on it. A paycheck is
 * extra only past the number every month has on its pay calendar: the 3rd every-two-weeks check,
 * the 5th weekly one. Twice-a-month and monthly pay never have an extra check. Anything not every
 * month (a quarterly or yearly bonus, a one-off) or planned at $0 (an occasional bonus) is extra too.
 */

export type PayFrequency = "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY";

/** Paydays every month has, whatever the calendar: 4 weekly, 2 every two weeks, 2 twice a month, 1 monthly. */
export const PAYDAYS_EVERY_MONTH: Record<PayFrequency, number> = { WEEKLY: 4, BIWEEKLY: 2, SEMI_MONTHLY: 2, MONTHLY: 1 };

export function isExtraIncome(
  item: { paydayNumber: number | null; scheduleKind: string; months: number[]; plannedCents: number },
  frequency: PayFrequency | null,
): boolean {
  const usual = frequency ? PAYDAYS_EVERY_MONTH[frequency] : 2;
  return (item.paydayNumber ?? 0) > usual || item.scheduleKind !== "MONTHLY" || item.months.length < 12 || item.plannedCents === 0;
}
