/**
 * Assembles a projection from what is stored.
 *
 * This is the question that was previously worked out by hand each month:
 * given the balance now, the bills still outstanding, and the paydays ahead,
 * how much can leave the account today without causing a shortfall later.
 */

import { prisma } from "@/lib/prisma";
import { toCents, type Cents } from "@/lib/money";
import {
  addDays,
  buildObligations,
  payDatesBetween,
  stripTime,
  utcDate,
  type LineItemForMonth,
} from "@/lib/month-model";
import { project, type ExpectedIncome, type Projection } from "@/lib/projection";
import { getSettings } from "./settings";

export interface ProjectionView extends Projection {
  billsAccountName: string | null;
  /** True when no balance has been recorded, so the figures mean nothing yet. */
  balanceMissing: boolean;
  horizonDays: number;
  bufferCents: Cents;
}

interface LineItemRow {
  id: string;
  name: string;
  kind: string;
  dueDay: number | null;
  periodAssignment: string;
  months: number[];
  scheduleKind: string;
  onlyYear: number | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  active: boolean;
  plannedAmount: { toString(): string };
  payScheduleId: string | null;
}

interface PayScheduleRow {
  id: string;
  frequency: string;
  anchorDate: Date | null;
  daysOfMonth: number[];
  activeFrom: Date;
  activeTo: Date | null;
}

const key = (id: string, year: number, month: number) => `${id}:${year}:${month}`;

export async function getProjection(options: {
  asOf?: Date;
  horizonDays?: number;
  proposedPaymentCents?: Cents;
} = {}): Promise<ProjectionView> {
  const settings = await getSettings();
  const asOf = stripTime(options.asOf ?? new Date());
  const horizonDays = options.horizonDays ?? settings.horizonDays;
  const end = addDays(asOf, horizonDays);

  const [items, schedules, accounts] = (await Promise.all([
    prisma.lineItem.findMany({ where: { active: true } }),
    prisma.paySchedule.findMany(),
    prisma.account.findMany(),
  ])) as [LineItemRow[], PayScheduleRow[], Array<{ id: string; name: string }>];

  // Months the horizon touches, plus a year back for anything unpaid.
  const months = monthsSpanning(addDays(asOf, -365), end);

  const [plans, actuals, balance] = (await Promise.all([
    prisma.monthlyPlan.findMany({ where: { OR: months } }),
    prisma.actualEntry.findMany({ where: { OR: months } }),
    settings.billsAccountId
      ? prisma.balanceSnapshot.findFirst({
          where: { accountId: settings.billsAccountId },
          orderBy: [{ year: "desc" }, { month: "desc" }],
        })
      : null,
  ])) as [
    Array<{ lineItemId: string; year: number; month: number; amount: { toString(): string } | null; skipped: boolean }>,
    Array<{ lineItemId: string; year: number; month: number }>,
    { amount: { toString(): string } } | null,
  ];

  const planMap = new Map(
    plans.map((p) => [
      key(p.lineItemId, p.year, p.month),
      { amountCents: p.amount === null ? null : toCents(p.amount), skipped: p.skipped },
    ]),
  );
  const settled = new Set(actuals.map((a) => key(a.lineItemId, a.year, a.month)));

  // Only a month that contains a recorded payment can hold an unpaid bill.
  // Without this the sweep treats every month before the data begins — and
  // every month after it ends — as a pile of missed payments, which is what made
  // the projection report a balance tens of thousands below reality.
  const trackedMonths = new Set(actuals.map((a) => `${a.year}:${a.month}`));

  const forModel: LineItemForMonth[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    kind: i.kind as LineItemForMonth["kind"],
    dueDay: i.dueDay,
    periodAssignment: i.periodAssignment as never,
    months: i.months,
    scheduleKind: i.scheduleKind,
    onlyYear: i.onlyYear,
    startYear: i.startYear,
    startMonth: i.startMonth,
    endYear: i.endYear,
    endMonth: i.endMonth,
    active: i.active,
  }));
  const planned = new Map(items.map((i) => [i.id, toCents(i.plannedAmount)]));

  // Obligations for every month the horizon reaches, deduplicated: the sweep
  // for a later month also returns earlier unpaid ones.
  const seen = new Set<string>();
  const obligations = [];

  for (const { year, month } of monthsSpanning(asOf, end)) {
    for (const o of buildObligations({
      items: forModel,
      planned,
      plans: planMap,
      settled,
      year,
      month,
      splitDay: settings.splitDay,
      carryMonths: 12,
    })) {
      const isThisMonth = o.year === year && o.month === month;
      if (!isThisMonth && !trackedMonths.has(`${o.year}:${o.month}`)) continue;

      const k = key(o.lineItemId, o.year, o.month);
      if (seen.has(k)) continue;
      seen.add(k);
      obligations.push(o);
    }
  }

  // Expected income. An item tied to a pay calendar lands on every payday that
  // calendar generates, which is what makes a three-payday month show up as
  // extra money rather than needing a third line item.
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  const income: ExpectedIncome[] = [];

  for (const item of items) {
    if (item.kind !== "INCOME") continue;
    const amountCents = toCents(item.plannedAmount);

    const schedule = item.payScheduleId ? scheduleById.get(item.payScheduleId) : undefined;

    if (schedule) {
      const from = schedule.activeFrom > asOf ? stripTime(schedule.activeFrom) : asOf;
      const to = schedule.activeTo && stripTime(schedule.activeTo) < end
        ? stripTime(schedule.activeTo)
        : end;

      for (const date of payDatesBetween(
        schedule.frequency as never,
        schedule.anchorDate,
        schedule.daysOfMonth,
        from,
        to,
      )) {
        income.push({ lineItemId: item.id, name: item.name, date, amountCents });
      }
      continue;
    }

    // Otherwise one arrival per month it applies to, on its day.
    for (const { year, month } of monthsSpanning(asOf, end)) {
      const model = forModel.find((f) => f.id === item.id)!;
      if (!model.months.includes(month)) continue;
      if (model.scheduleKind === "ONE_OFF" && model.onlyYear !== year) continue;

      const day = Math.min(Math.max(item.dueDay ?? 1, 1), 28);
      const date = utcDate(year, month, day);
      if (date < asOf || date > end) continue;

      const override = planMap.get(key(item.id, year, month));
      if (override?.skipped) continue;

      income.push({
        lineItemId: item.id,
        name: item.name,
        date,
        amountCents: override?.amountCents ?? amountCents,
      });
    }
  }

  const openingBalanceCents = balance ? toCents(balance.amount) : 0;

  const result = project({
    openingBalanceCents,
    asOf,
    obligations,
    income,
    horizonDays,
    bufferCents: settings.bufferCents,
    proposedPayment: options.proposedPaymentCents
      ? { amountCents: options.proposedPaymentCents }
      : undefined,
  });

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return {
    ...result,
    billsAccountName: settings.billsAccountId
      ? (accountName.get(settings.billsAccountId) ?? null)
      : null,
    balanceMissing: balance === null,
    horizonDays,
    bufferCents: settings.bufferCents,
  };
}

function monthsSpanning(from: Date, to: Date): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth() + 1;
  const last = to.getUTCFullYear() * 12 + to.getUTCMonth() + 1;

  while (y * 12 + m <= last) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
