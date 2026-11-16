/** The pay calendar the bank's paycheck deposits suggest, and how it compares to the one set up. */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { calendarMatches, detectPay, type DetectedPay } from "@/lib/pay-detect";
import { isIncomeCategory } from "@/lib/category-guess";
import { createPaySchedule, listPaySchedules, previewPayDates, updatePaySchedule, type PaySchedule } from "./pay-schedule";
import { NotFoundError } from "./errors";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface PayCheck {
  detected: DetectedPay;
  schedule: PaySchedule | null;
  matches: boolean;
}

export async function payFromDeposits(): Promise<PayCheck | null> {
  const rows = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: new Date(Date.now() - 180 * DAY) }, kind: "NORMAL", pending: false, amount: { gt: 300 }, account: { hidden: false, type: "CHECKING" } },
    select: { postedOn: true, amount: true, merchant: true, description: true, category: { select: { name: true } } },
  })) as Array<{ postedOn: Date; amount: { toString(): string }; merchant: string; description: string; category: { name: string } | null }>;
  const pay = rows.filter((r) => isIncomeCategory(r.category?.name) || /payroll|direct dep|dir dep|salary/i.test(`${r.merchant} ${r.description}`));
  // The employer with the most deposits is the main paycheck.
  const byMerchant = new Map<string, string[]>();
  for (const r of pay) if (toCents(r.amount) > 0) byMerchant.set(r.merchant, [...(byMerchant.get(r.merchant) ?? []), iso(r.postedOn)]);
  const dates = [...byMerchant.values()].sort((a, b) => b.length - a.length)[0];
  if (!dates) return null;
  const detected = detectPay(dates);
  if (!detected) return null;
  const schedules = await listPaySchedules();
  const today = new Date();
  const schedule = schedules.find((s) => !s.activeTo || s.activeTo >= iso(today)) ?? null;
  const from = new Date(Date.parse(`${[...dates].sort()[0]}T00:00:00Z`) - 4 * DAY);
  const matches = schedule ? calendarMatches(previewPayDates(schedule, from, today), dates) : false;
  return { detected, schedule, matches };
}

/** Sets the pay calendar to what the deposits show. */
export async function usePayFromDeposits(): Promise<void> {
  const check = await payFromDeposits();
  if (!check) throw new NotFoundError("Paycheck pattern");
  const { detected, schedule } = check;
  const weekly = detected.frequency === "WEEKLY" || detected.frequency === "BIWEEKLY";
  const fresh = {
    name: schedule?.name ?? "Paycheck",
    frequency: detected.frequency,
    anchorDate: weekly ? detected.latest : null,
    daysOfMonth: weekly ? [] : detected.daysOfMonth,
    activeFrom: detected.latest,
    activeTo: null,
  };
  if (schedule && schedule.frequency === detected.frequency) {
    // Same kind of schedule, wrong dates: correct it in place.
    await updatePaySchedule(schedule.id, { ...fresh, activeFrom: schedule.activeFrom });
  } else {
    // A different kind of schedule: the old one ends, so past months keep what was true then.
    if (schedule) {
      const dayBefore = new Date(Date.parse(`${detected.latest}T00:00:00Z`) - DAY).toISOString().slice(0, 10);
      await updatePaySchedule(schedule.id, { ...schedule, activeTo: dayBefore < schedule.activeFrom ? schedule.activeFrom : dayBefore });
    }
    await createPaySchedule(fresh);
  }
}
