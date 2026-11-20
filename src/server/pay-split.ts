/**
 * Paydays from the pay calendar, and where the month divides.
 *
 * The main paycheck is the calendar most income items use (or the only one).
 * Each month uses whichever calendar was in effect then, with moved or extra
 * paydays applied.
 *
 * The month divides at the payday nearest the 15th (from the 8th on), so each
 * half is the bills one paycheck covers: paid every two weeks on the 6th and
 * 20th, the split is the 20th; on the 2nd, 16th and 30th, it's the 16th (the
 * third paycheck is extra); twice a month on the 15th and last day, it's the
 * 15th. Monthly pay, no calendar, or the "fixed day" setting fall back to the
 * split day.
 */

import { prisma } from "@/lib/prisma";
import { SETTING_KEYS } from "@/lib/settings";
import { payDatesBetween, utcDate, daysInMonth } from "@/lib/month-model";
import type { Settings } from "./settings";

export interface MonthSplit {
  splitDay: number;
  /** The payday the split falls on (YYYY-MM-DD), or null for a fixed day. */
  payday: string | null;
}

type ScheduleRow = {
  id: string;
  frequency: "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY";
  anchorDate: Date | null;
  daysOfMonth: number[];
  activeFrom: Date;
  activeTo: Date | null;
  _count: { lineItems: number };
  overrides: Array<{ originalDate: Date | null; actualDate: Date; suppressed: boolean }>;
};

export type PaydaysIn = (year: number, month: number) => Date[];

/** Loads the pay calendars once; the result gives any month's main paydays. */
export async function loadPaydays(): Promise<PaydaysIn & { frequency: (year: number, month: number) => ScheduleRow["frequency"] | null }> {
  const schedules = (await prisma.paySchedule.findMany({
    select: {
      id: true, frequency: true, anchorDate: true, daysOfMonth: true, activeFrom: true, activeTo: true,
      _count: { select: { lineItems: true } },
      overrides: { select: { originalDate: true, actualDate: true, suppressed: true } },
    },
  })) as ScheduleRow[];
  const chosen = ((await prisma.setting.findUnique({ where: { key: SETTING_KEYS.splitSchedule } })) as { value: unknown } | null)?.value;
  const pick = (year: number, month: number) => {
    const start = utcDate(year, month, 1);
    const end = utcDate(year, month, daysInMonth(year, month));
    const live = schedules.filter((s) => s.activeFrom <= end && (!s.activeTo || s.activeTo >= start));
    // The schedule picked in Pay Settings divides the month while it's in effect; otherwise the one most paychecks use.
    const picked = typeof chosen === "string" ? live.find((s) => s.id === chosen) : undefined;
    return { start, end, main: picked ?? [...live].sort((a, b) => b._count.lineItems - a._count.lineItems || b.activeFrom.getTime() - a.activeFrom.getTime())[0] };
  };
  const cache = new Map<number, Date[]>();
  const fn = ((year: number, month: number) => {
    const k = year * 12 + month;
    if (cache.has(k)) return cache.get(k)!;
    const { start, end, main } = pick(year, month);
    let days: Date[] = [];
    if (main) {
      days = payDatesBetween(main.frequency, main.anchorDate, main.daysOfMonth, start, end);
      for (const o of main.overrides) {
        if (o.originalDate) days = days.filter((d) => d.getTime() !== o.originalDate!.getTime());
        if (!o.suppressed && o.actualDate >= start && o.actualDate <= end) days.push(o.actualDate);
      }
      days.sort((a, b) => a.getTime() - b.getTime());
    }
    cache.set(k, days);
    return days;
  }) as PaydaysIn & { frequency: (year: number, month: number) => ScheduleRow["frequency"] | null };
  fn.frequency = (year, month) => pick(year, month).main?.frequency ?? null;
  return fn;
}

/** The payday nearest the 15th, from the 8th on; null when there isn't one. */
export function paydaySplitDay(paydays: Date[]): number | null {
  const days = paydays.map((d) => d.getUTCDate()).filter((d) => d >= 8 && d <= 28);
  if (!days.length) return null;
  return days.reduce((best, d) => (Math.abs(d - 15) < Math.abs(best - 15) ? d : best));
}

export async function monthSplit(
  year: number,
  month: number,
  settings: Pick<Settings, "splitDay" | "splitMode">,
  paydays?: Awaited<ReturnType<typeof loadPaydays>>,
): Promise<MonthSplit> {
  const fixed = { splitDay: settings.splitDay, payday: null };
  // One period: every day falls in the first "half".
  if (settings.splitMode === "none") return { splitDay: 31, payday: null };
  if (settings.splitMode === "day") return fixed;
  const p = paydays ?? (await loadPaydays());
  if (p.frequency(year, month) === "MONTHLY") return fixed;
  const day = paydaySplitDay(p(year, month));
  if (day === null) return fixed;
  return { splitDay: day, payday: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}
