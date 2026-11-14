/** Date fields the phone API accepts. */

/** "2026-11-21" → that day at UTC midnight; anything else → undefined. */
export function parseDay(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const value = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

/**
 * When Confirm was pressed on the phone, as an ISO timestamp. A value more
 * than a day in the future is a broken clock, not a real time, and is ignored
 * (so it can't be used to win every conflict).
 */
export function parseEnteredAt(raw: unknown, now = Date.now()): Date | undefined {
  if (typeof raw !== "string" || raw.length > 40) return undefined;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms) || ms > now + 86_400_000) return undefined;
  return new Date(ms);
}
