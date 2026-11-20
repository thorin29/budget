/**
 * Loads a year for the Year & reports page and the CSV export.
 */

import { loadPaydays } from "./pay-split";
import { prisma } from "@/lib/prisma";
import { billTypes, type BillItem, type CardRow } from "./month-plan";
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
  /**
   * Which part of the table each row belongs to, the same split as the other tabs: bills, the 0%
   * card's debt payment, card payments (left out of Bills: the cards' charges count as spending),
   * and anything paid from what's left.
   */
  sectionOf: Record<string, YearSection>;
  /** Previous year, by month (index 0 = January): what was paid on rows that are bills now. */
  previousBillsByMonth: Cents[];
  /** Each row's first recorded payment ever, YYYY-MM: before it, an empty month isn't a miss. */
  firstPaid: Record<string, string>;
}

export type YearSection = "income" | "bills" | "debt" | "cards" | "surplus";

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

  const [cardRows, prevActuals, firsts] = (await Promise.all([
    prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD", hidden: false }, select: { id: true, name: true, nickname: true, institution: true, promoEndsOn: true } }),
    prisma.actualEntry.findMany({ where: { year: year - 1 }, select: { lineItemId: true, month: true, amount: true } }),
    prisma.actualEntry.findMany({ select: { lineItemId: true, year: true, month: true } }),
  ])) as [CardRow[], Array<{ lineItemId: string; month: number; amount: { toString(): string } }>, Array<{ lineItemId: string; year: number; month: number }>];
  // The first month with a payment, for each row.
  const firstPaid: Record<string, string> = {};
  for (const f of firsts) {
    const k = `${f.year}-${String(f.month).padStart(2, "0")}`;
    if (!firstPaid[f.lineItemId] || k < firstPaid[f.lineItemId]) firstPaid[f.lineItemId] = k;
  }
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { isCardPayment, isDebt } = billTypes(items as unknown as BillItem[], cardRows, today);
  const sectionOf: Record<string, YearSection> = {};
  for (const i of items) {
    // Paid from what's left is a card payment too (the month plan treats it as one).
    sectionOf[i.id] = i.kind === "INCOME" ? "income" : isDebt(i.id) ? "debt" : isCardPayment(i.id) || i.paidFromSurplus ? "cards" : "bills";
  }
  const previousBillsByMonth = Array.from({ length: 12 }, () => 0);
  for (const a of prevActuals) if (sectionOf[a.lineItemId] === "bills") previousBillsByMonth[a.month - 1] += toCents(a.amount);

  const yearSet = new Set(years.map((y) => y.year));
  yearSet.add(now.getFullYear());
  yearSet.add(year);

  return {
    ...grid,
    years: [...yearSet].sort((a, b) => b - a),
    previousBillsPaidCents: previous.length
      ? previous.reduce((s, a) => s + toCents(a.amount), 0)
      : null,
    sectionOf,
    previousBillsByMonth,
    firstPaid,
  };
}
