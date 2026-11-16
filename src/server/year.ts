/**
 * Loads a year for the Year & reports page and the CSV export.
 */

import { loadPaydays } from "./pay-split";
import { prisma } from "@/lib/prisma";
import { toCents, type Cents } from "@/lib/money";
import { buildYearGrid, type YearGrid, type YearItem } from "@/lib/year";

interface ItemRow {
  id: string;
  name: string;
  kind: string;
  categoryId: string | null;
  plannedAmount: { toString(): string };
  dueDay: number | null;
  periodAssignment: string;
  scheduleKind: string;
  months: number[];
  onlyYear: number | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  active: boolean;
  paidFromSurplus: boolean;
}

interface AmountRow {
  lineItemId: string;
  month: number;
  amount: { toString(): string } | null;
}

export interface YearView extends YearGrid {
  /** Years with anything recorded, plus the current one, newest first. */
  years: number[];
  /** Bills paid in the previous year, for comparison. Null if none. */
  previousBillsPaidCents: Cents | null;
}

export async function getYearView(year: number, now = new Date()): Promise<YearView> {
  const [items, categories, plans, actuals, years, previous] = (await Promise.all([
    prisma.lineItem.findMany(),
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.monthlyPlan.findMany({ where: { year } }),
    prisma.actualEntry.findMany({ where: { year } }),
    prisma.actualEntry.findMany({ distinct: ["year"], select: { year: true } }),
    prisma.actualEntry.findMany({
      where: { year: year - 1, lineItem: { kind: { not: "INCOME" }, paidFromSurplus: false } },
      select: { amount: true },
    }),
  ])) as [
    ItemRow[],
    Array<{ id: string; name: string }>,
    Array<AmountRow & { skipped: boolean }>,
    Array<AmountRow & { amount: { toString(): string } }>,
    Array<{ year: number }>,
    Array<{ amount: { toString(): string } }>,
  ];

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const yearItems: YearItem[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    kind: i.kind as YearItem["kind"],
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
    paydayNumber: (i as { paydayNumber?: number | null }).paydayNumber ?? null,
    plannedCents: toCents(i.plannedAmount),
    categoryName: i.categoryId ? (categoryName.get(i.categoryId) ?? null) : null,
    paidFromSurplus: i.paidFromSurplus,
  }));

  const grid = buildYearGrid({
    year,
    items: yearItems,
    plans: new Map(
      plans.map((p) => [
        `${p.lineItemId}:${p.month}`,
        { amountCents: p.amount === null ? null : toCents(p.amount), skipped: p.skipped },
      ]),
    ),
    actuals: new Map(actuals.map((a) => [`${a.lineItemId}:${a.month}`, toCents(a.amount)])),
    now: { year: now.getFullYear(), month: now.getMonth() + 1 },
    paydaysIn: await loadPaydays(),
  });

  const yearSet = new Set(years.map((y) => y.year));
  yearSet.add(now.getFullYear());
  yearSet.add(year);

  return {
    ...grid,
    years: [...yearSet].sort((a, b) => b - a),
    previousBillsPaidCents: previous.length
      ? previous.reduce((s, a) => s + toCents(a.amount), 0)
      : null,
  };
}
