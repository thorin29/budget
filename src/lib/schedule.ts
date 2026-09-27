/**
 * Schedule arithmetic.
 *
 * Kept free of database imports so it can be exercised directly: the months a
 * schedule implies are a pure function of its kind and anchor, and that is worth
 * being able to test without a client or a connection.
 */

export const SCHEDULE_KINDS = [
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "ANNUAL",
  "CUSTOM",
  "ONE_OFF",
] as const;

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * The months a schedule covers, given the month it is anchored to. CUSTOM keeps
 * whatever was supplied; everything else is derived, so the stored month set and
 * the stated frequency cannot drift apart.
 */
export function monthsForSchedule(
  kind: ScheduleKind,
  anchorMonth: number,
  custom: number[] = [],
): number[] {
  const anchor = Math.min(Math.max(anchorMonth, 1), 12);

  switch (kind) {
    case "MONTHLY":
      return [...ALL_MONTHS];
    case "QUARTERLY":
      return [0, 3, 6, 9]
        .map((offset) => ((anchor - 1 + offset) % 12) + 1)
        .sort((a, b) => a - b);
    case "SEMI_ANNUAL":
      return [0, 6].map((offset) => ((anchor - 1 + offset) % 12) + 1).sort((a, b) => a - b);
    case "ANNUAL":
    case "ONE_OFF":
      return [anchor];
    case "CUSTOM":
      return [...new Set(custom)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  }
}
