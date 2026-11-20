/**
 * A month cut into pay periods: one per paycheck, each running from its payday to the day before the
 * next. Days before the month's first payday belong to the last paycheck of the month before. A bill
 * falls in the period its due day is in, so it's paid from that period's paycheck; one due on a
 * payday belongs to the paycheck arriving that day.
 */

export interface PeriodBounds {
  /** First and last day of the month in this period. */
  startDay: number;
  endDay: number;
  /** The payday that starts it, or null for the days before the month's first payday. */
  payday: number | null;
}

export function periodBounds(paydays: number[], daysInMonth: number): PeriodBounds[] {
  const days = [...new Set(paydays.filter((d) => d >= 1 && d <= daysInMonth))].sort((a, b) => a - b);
  if (!days.length) return [{ startDay: 1, endDay: daysInMonth, payday: null }];
  const out: PeriodBounds[] = [];
  if (days[0] > 1) out.push({ startDay: 1, endDay: days[0] - 1, payday: null });
  days.forEach((d, i) => out.push({ startDay: d, endDay: (days[i + 1] ?? daysInMonth + 1) - 1, payday: d }));
  return out;
}

/** Which period a due day falls in (no due day: the first). */
export function periodIndex(bounds: PeriodBounds[], dueDay: number | null): number {
  if (dueDay == null) return 0;
  const i = bounds.findIndex((b) => dueDay >= b.startDay && dueDay <= b.endDay);
  return i >= 0 ? i : bounds.length - 1;
}
