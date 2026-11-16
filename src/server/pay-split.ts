/**
 * Where the month divides. With a pay calendar, it divides at the payday
 * nearest the 15th (from the 8th on), so each half is the bills one paycheck
 * covers: paid every two weeks on the 6th and 20th, the split is the 20th; on
 * the 2nd, 16th and 30th, it's the 16th (the third paycheck is extra); twice a
 * month on the 15th and last day, it's the 15th. Monthly pay, no calendar, or
 * the "fixed day" setting fall back to the split day.
 */

import { prisma } from "@/lib/prisma";
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

/** The payday nearest the 15th, from the 8th on; null when there isn't one. */
export function paydaySplitDay(paydays: Date[]): number | null {
  const days = paydays.map((d) => d.getUTCDate()).filter((d) => d >= 8 && d <= 28);
  if (!days.length) return null;
  return days.reduce((best, d) => (Math.abs(d - 15) < Math.abs(best - 15) ? d : best));
}

export async function monthSplit(year: number, month: number, settings: Pick<Settings, "splitDay" | "splitMode">): Promise<MonthSplit> {
  const fixed = { splitDay: settings.splitDay, payday: null };
  if (settings.splitMode === "day") return fixed;
  const start = utcDate(year, month, 1);
  const end = utcDate(year, month, daysInMonth(year, month));
  const schedules = (await prisma.paySchedule.findMany({
    where: { activeFrom: { lte: end }, OR: [{ activeTo: null }, { activeTo: { gte: start } }], frequency: { not: "MONTHLY" } },
    select: {
      id: true, frequency: true, anchorDate: true, daysOfMonth: true, activeFrom: true, activeTo: true,
      _count: { select: { lineItems: true } },
      overrides: { select: { originalDate: true, actualDate: true, suppressed: true } },
    },
  })) as ScheduleRow[];
  if (!schedules.length) return fixed;
  // The main paycheck: the calendar most income items use.
  const main = [...schedules].sort((a, b) => b._count.lineItems - a._count.lineItems)[0];
  let paydays = payDatesBetween(main.frequency, main.anchorDate, main.daysOfMonth, start, end);
  for (const o of main.overrides) {
    if (o.originalDate) paydays = paydays.filter((d) => d.getTime() !== o.originalDate!.getTime());
    if (!o.suppressed && o.actualDate >= start && o.actualDate <= end) paydays.push(o.actualDate);
  }
  const day = paydaySplitDay(paydays);
  if (day === null) return fixed;
  return { splitDay: day, payday: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}
