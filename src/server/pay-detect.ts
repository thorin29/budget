/** The pay calendar the bank's paycheck deposits suggest, and how it compares to the one set up. */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { calendarMatches, detectPay, employerKey, type DetectedPay } from "@/lib/pay-detect";
import { isIncomeCategory, isPeerPayment } from "@/lib/category-guess";
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
  // Every regular deposit is a candidate (feeds often drop the word "payroll"); payment apps aren't pay.
  const deposits = rows.filter((r) => toCents(r.amount) > 0 && !isPeerPayment(r.merchant));
  // Group one employer's deposits even when the description changes, and take the
  // group that follows a schedule with the most deposits (paid more often beats monthly).
  const byEmployer = new Map<string, { dates: string[]; labeled: boolean }>();
  for (const r of deposits) {
    const k = employerKey(r.merchant);
    if (!k) continue;
    const g = byEmployer.get(k) ?? { dates: [], labeled: false };
    g.dates.push(iso(r.postedOn));
    g.labeled ||= isIncomeCategory(r.category?.name) || /payroll|direct dep|dir dep|salary/i.test(`${r.merchant} ${r.description}`);
    byEmployer.set(k, g);
  }
  const found = [...byEmployer.values()]
    .map((g) => ({ ...g, detected: detectPay(g.dates) }))
    .filter((g) => g.detected)
    .sort((a, b) => Number(b.labeled) - Number(a.labeled) || b.dates.length - a.dates.length)[0];
  if (!found) return null;
  const dates = found.dates;
  const detected = found.detected!;
  const schedules = await listPaySchedules();
  const today = new Date();
  const schedule = schedules.find((s) => !s.activeTo || s.activeTo >= iso(today)) ?? null;
  const from = new Date(Date.parse(`${[...dates].sort()[0]}T00:00:00Z`) - 4 * DAY);
  const matches = schedule ? calendarMatches(previewPayDates(schedule, from, today), dates, detected.latest) : false;
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
