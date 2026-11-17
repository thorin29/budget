/**
 * When the bank sync is due. Pure, so it can be tested.
 *
 * SimpleFIN asks apps to make 24 requests a day or fewer, at an odd minute
 * rather than on the hour. The sync runs every BANK_SYNC_EVERY_HOURS hours
 * (4 by default), counted from BANK_SYNC_HOUR (6 by default), at 17 past:
 * 2:17, 6:17, 10:17, 14:17, 18:17 and 22:17, six a day. A failed attempt is
 * retried an hour later. "Sync now" counts toward the same daily cap.
 */

const RETRY_AFTER_MS = 60 * 60_000;
export const SLOT_MINUTE = 17;
/** Requests a day, scheduled and by hand together; under the bridge's 24. */
export const DAILY_LIMIT = 20;
/** "Sync now" from a phone waits this long after the last attempt. */
export const MANUAL_GAP_MS = 10 * 60_000;

export function localParts(date: Date): { day: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")) };
}

export function syncHour(): number {
  const hour = Number(process.env.BANK_SYNC_HOUR ?? 6);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 6;
}

export function syncEveryHours(): number {
  const every = Number(process.env.BANK_SYNC_EVERY_HOURS ?? 4);
  return Number.isInteger(every) && every >= 2 && every <= 24 ? every : 4;
}

/** The local hours the sync runs at, in order. */
export function syncHours(hour = syncHour(), every = syncEveryHours()): number[] {
  const out: number[] = [];
  for (let h = 0; h < 24; h++) if ((((h - hour) % every) + every) % every === 0) out.push(h);
  return out;
}

/** The most recent scheduled time at or before `now`. */
export function lastSlot(now: Date, hour = syncHour(), every = syncEveryHours()): Date {
  const local = localParts(now);
  const hours = new Set(syncHours(hour, every));
  for (let back = 0; back < 48; back++) {
    const h = (((local.hour - back) % 24) + 24) % 24;
    if (!hours.has(h)) continue;
    if (back === 0 && local.minute < SLOT_MINUTE) continue;
    const minutesBack = back * 60 + (local.minute - SLOT_MINUTE);
    const start = new Date(now.getTime() - minutesBack * 60_000);
    start.setUTCSeconds(0, 0);
    return start;
  }
  return new Date(now.getTime() - 24 * 3_600_000);
}

/** Whether the scheduled sync should run now. Exported for tests. */
export function isDue(
  now: Date,
  lastSuccessAt: Date | null,
  lastSyncAt: Date | null,
  hour = syncHour(),
  every = syncEveryHours(),
): boolean {
  if (lastSuccessAt && lastSuccessAt.getTime() >= lastSlot(now, hour, every).getTime()) return false;
  if (lastSyncAt && now.getTime() - lastSyncAt.getTime() < RETRY_AFTER_MS) return false;
  return true;
}

/** Requests used today, given what was stored: resets on a new local day. */
export function requestsToday(stored: unknown, now: Date): number {
  const v = stored as { day?: unknown; count?: unknown } | null;
  return v && v.day === localParts(now).day && typeof v.count === "number" ? v.count : 0;
}
