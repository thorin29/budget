/** When the daily bank sync is due. Pure, so it can be tested. */

const RETRY_AFTER_MS = 3 * 60 * 60_000;

export function localParts(date: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function syncHour(): number {
  const hour = Number(process.env.BANK_SYNC_HOUR ?? 6);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 6;
}

/** Whether the daily sync should run now. Exported for tests. */
export function isDue(
  now: Date,
  lastSuccessAt: Date | null,
  lastSyncAt: Date | null,
  hour = syncHour(),
): boolean {
  const today = localParts(now);
  if (today.hour < hour) return false;
  if (lastSuccessAt && localParts(lastSuccessAt).day === today.day) return false;
  if (lastSyncAt && now.getTime() - lastSyncAt.getTime() < RETRY_AFTER_MS) return false;
  return true;
}

