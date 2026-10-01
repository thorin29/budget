/**
 * The month view.
 *
 * Assembles everything the summary screen needs: what is owed, what has been
 * paid, what remains in each half, and how much can leave the bills account.
 *
 * Two departures from the spreadsheet this replaces:
 *
 *  - An unpaid bill does not vanish at month end. It carries forward with its
 *    original due date until settled or marked as nothing due.
 *  - Remaining counts the budgeted amount of items that are *not yet paid*,
 *    rather than subtracting actuals from budgets. Entering an actual of less
 *    than the budget settles the item; it does not leave a balance owing.
 */

import { prisma } from "@/lib/prisma";
import { toCents, toDecimalString, type Cents } from "@/lib/money";
import { ValidationError } from "./errors";
import {
  buildObligations,
  halfFor,
  isDueInMonth,
  monthHalves,
  utcDate,
  type LineItemForMonth,
  type MonthHalf,
} from "@/lib/month-model";
import { getSettings } from "./settings";

export interface MonthEntry {
  lineItemId: string;
  name: string;
  /** The month this entry belongs to — not always the month being viewed. */
  year: number;
  month: number;
  kind: "BILL" | "SETTLEMENT" | "INCOME";
  categoryName: string | null;
  accountName: string | null;
  paymentUrl: string | null;
  dueDay: number | null;
  /** What is owed this month: the override if set, otherwise the plan. */
  budgetedCents: Cents;
  /** The template, for showing when a month deviates from it. */
  plannedCents: Cents;
  /** Null until something is entered. Its presence means settled. */
  actualCents: Cents | null;
  /** Explicitly nothing owed this month — distinct from zero. */
  skipped: boolean;
  /** True when the month's budget differs from the plan. */
  adjusted: boolean;
  half: 0 | 1;
  /** Paid from what is left over; kept out of the cash figures. */
  paidFromSurplus: boolean;
  /** Set when the entry originates in an earlier, unpaid month. */
  carriedFrom: { year: number; month: number } | null;
}

export interface HalfSummary {
  half: MonthHalf;
  entries: MonthEntry[];
  budgetedCents: Cents;
  paidCents: Cents;
  /** Budgeted total of everything in this half still unpaid. */
  remainingCents: Cents;
}

export interface MonthView {
  year: number;
  month: number;
  splitDay: number;
  halves: [HalfSummary, HalfSummary];
  /**
   * Paid from whatever is left after the bills. Excluded from the halves, the
   * remaining figures and the transfer figures; tracked in its own right.
   */
  surplusItems: MonthEntry[];
  surplusBudgetedCents: Cents;
  surplusPaidCents: Cents;
  /** Genuinely outstanding items from earlier months, kept out of the halves. */
  carried: MonthEntry[];
  carriedCents: Cents;
  /** How many months back an unpaid bill was allowed to count. */
  carryMonths: number;
  income: MonthEntry[];
  incomeExpectedCents: Cents;
  incomeReceivedCents: Cents;
  /** Balance set aside for bills. Null until one has been recorded. */
  billsBalanceCents: Cents | null;
  /**
   * The month that balance was actually entered in. When it is earlier than the
   * month being viewed, the figure is carried forward and worth marking as such
   * — it is the last known position, not a fresh one.
   */
  billsBalanceFrom: { year: number; month: number } | null;
  billsAccountId: string | null;
  billsAccountName: string | null;
  /** Balance less the first half's remaining. */
  transferAfterFirstCents: Cents | null;
  /** Balance less both halves' remaining. */
  transferAfterSecondCents: Cents | null;
  totalBudgetedCents: Cents;
  totalPaidCents: Cents;
  totalRemainingCents: Cents;
  carriedCount: number;
}

const key = (id: string, year: number, month: number) => `${id}:${year}:${month}`;

/**
 * Row shapes are declared rather than inferred from the generated client, so
 * this module typechecks without one — the same reason the domain modules
 * declare their own enum type.
 */
interface LineItemRow {
  id: string;
  name: string;
  kind: string;
  categoryId: string | null;
  paidFromId: string | null;
  chargedToId: string | null;
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
  paymentUrl: string | null;
  active: boolean;
  paidFromSurplus: boolean;
}

interface NamedRow {
  id: string;
  name: string;
}

interface MonthlyPlanRow {
  lineItemId: string;
  year: number;
  month: number;
  amount: { toString(): string } | null;
  skipped: boolean;
}

interface ActualRow {
  lineItemId: string;
  year: number;
  month: number;
  amount: { toString(): string };
}

export async function getMonthView(year: number, month: number): Promise<MonthView> {
  const settings = await getSettings();
  const splitDay = settings.splitDay;

  const [items, categories, accounts] = (await Promise.all([
    prisma.lineItem.findMany({ where: { active: true } }),
    prisma.category.findMany(),
    prisma.account.findMany(),
  ])) as [LineItemRow[], NamedRow[], NamedRow[]];

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  // A year of history is enough to surface anything genuinely outstanding
  // without sweeping the whole table on every page load.
  const from = utcDate(year, month, 1);
  const earliest = new Date(Date.UTC(from.getUTCFullYear() - 1, from.getUTCMonth(), 1));

  const [plans, actuals, balance] = (await Promise.all([
    prisma.monthlyPlan.findMany({
      where: { OR: monthsBetween(earliest, year, month).map((m) => ({ year: m.year, month: m.month })) },
    }),
    prisma.actualEntry.findMany({
      where: { OR: monthsBetween(earliest, year, month).map((m) => ({ year: m.year, month: m.month })) },
    }),
    settings.billsAccountId
      ? prisma.balanceSnapshot.findFirst({
          where: {
            accountId: settings.billsAccountId,
            OR: [{ year: { lt: year } }, { year, month: { lte: month } }],
          },
          orderBy: [{ year: "desc" }, { month: "desc" }],
        })
      : null,
  ])) as [
    MonthlyPlanRow[],
    ActualRow[],
    { amount: { toString(): string }; year: number; month: number } | null,
  ];

  const planMap = new Map(
    plans.map((p) => [
      key(p.lineItemId, p.year, p.month),
      { amountCents: p.amount === null ? null : toCents(p.amount), skipped: p.skipped },
    ]),
  );
  const actualMap = new Map(
    actuals.map((a) => [key(a.lineItemId, a.year, a.month), toCents(a.amount)]),
  );
  const settled = new Set(actuals.map((a) => key(a.lineItemId, a.year, a.month)));

  const forModel: LineItemForMonth[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    kind: i.kind as MonthEntry["kind"],
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

  // A month only counts as one where a bill could have gone unpaid if something
  // was actually recorded in it. Without this, every month before the first
  // payment — and every month after the last — reads as a pile of missed bills.
  const trackedMonths = new Set(actuals.map((a) => `${a.year}:${a.month}`));

  const obligations = buildObligations({
    items: forModel,
    planned,
    plans: planMap,
    settled,
    year,
    month,
    splitDay,
    carryMonths: settings.carryMonths,
  }).filter(
    (o) =>
      (o.year === year && o.month === month) ||
      trackedMonths.has(`${o.year}:${o.month}`),
  );

  const itemById = new Map(items.map((i) => [i.id, i]));

  // Unpaid obligations, including carried-over ones.
  const entries: MonthEntry[] = obligations.map((o) => {
    const item = itemById.get(o.lineItemId)!;
    return {
      lineItemId: item.id,
      name: item.name,
      year: o.year,
      month: o.month,
      kind: item.kind as MonthEntry["kind"],
      categoryName: item.categoryId ? (categoryName.get(item.categoryId) ?? null) : null,
      accountName: item.paidFromId ? (accountName.get(item.paidFromId) ?? null) : null,
      paymentUrl: item.paymentUrl,
      dueDay: item.dueDay,
      budgetedCents: o.amountCents,
      plannedCents: planned.get(item.id) ?? 0,
      actualCents: null,
      skipped: false,
      adjusted: o.amountCents !== (planned.get(item.id) ?? 0),
      half: o.half,
      paidFromSurplus: item.paidFromSurplus,
      carriedFrom: o.carriedOver ? { year: o.year, month: o.month } : null,
    };
  });

  // Paid items for this month, which buildObligations deliberately omits.
  for (const item of items) {
    if (item.kind === "INCOME") continue;
    if (!isDueInMonth(forModel.find((f) => f.id === item.id)!, year, month)) continue;

    const k = key(item.id, year, month);
    const actual = actualMap.get(k);
    if (actual === undefined) continue;

    const plan = planMap.get(k);
    const budgeted = plan?.amountCents ?? planned.get(item.id) ?? 0;

    entries.push({
      lineItemId: item.id,
      name: item.name,
      year,
      month,
      kind: item.kind as MonthEntry["kind"],
      categoryName: item.categoryId ? (categoryName.get(item.categoryId) ?? null) : null,
      accountName: item.paidFromId ? (accountName.get(item.paidFromId) ?? null) : null,
      paymentUrl: item.paymentUrl,
      dueDay: item.dueDay,
      budgetedCents: budgeted,
      plannedCents: planned.get(item.id) ?? 0,
      actualCents: actual,
      skipped: plan?.skipped ?? false,
      adjusted: budgeted !== (planned.get(item.id) ?? 0),
      half: halfFor(item.dueDay, item.periodAssignment as never, splitDay),
      paidFromSurplus: item.paidFromSurplus,
      carriedFrom: null,
    });
  }

  const halfDefs = monthHalves(year, month, splitDay);

  // Items paid from the surplus leave the halves entirely: they do not compete
  // with the bills for cash, they consume what is left after them.
  const surplus = entries
    .filter((e) => e.paidFromSurplus)
    .sort((a, b) => (a.dueDay ?? 0) - (b.dueDay ?? 0));

  const carried = entries
    .filter((e) => e.carriedFrom !== null && !e.paidFromSurplus)
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));

  const thisMonth = entries.filter((e) => e.carriedFrom === null && !e.paidFromSurplus);

  const buildHalf = (index: 0 | 1): HalfSummary => {
    const inHalf = thisMonth
      .filter((e) => e.half === index)
      .sort((a, b) => (a.dueDay ?? 0) - (b.dueDay ?? 0));

    return {
      half: halfDefs[index],
      entries: inHalf,
      budgetedCents: inHalf.reduce((s, e) => s + e.budgetedCents, 0),
      paidCents: inHalf.reduce((s, e) => s + (e.actualCents ?? 0), 0),
      remainingCents: inHalf
        .filter((e) => e.actualCents === null)
        .reduce((s, e) => s + e.budgetedCents, 0),
    };
  };

  const halves: [HalfSummary, HalfSummary] = [buildHalf(0), buildHalf(1)];

  // Income for this month.
  const income: MonthEntry[] = items
    .filter((i) => i.kind === "INCOME")
    .filter((i) => isDueInMonth(forModel.find((f) => f.id === i.id)!, year, month))
    .map((item) => {
      const k = key(item.id, year, month);
      const plan = planMap.get(k);
      const budgeted = plan?.amountCents ?? toCents(item.plannedAmount);
      return {
        lineItemId: item.id,
        name: item.name,
        year,
        month,
        kind: "INCOME" as const,
        categoryName: item.categoryId ? (categoryName.get(item.categoryId) ?? null) : null,
        accountName: item.paidFromId ? (accountName.get(item.paidFromId) ?? null) : null,
        paymentUrl: item.paymentUrl,
        dueDay: item.dueDay,
        budgetedCents: budgeted,
        plannedCents: toCents(item.plannedAmount),
        actualCents: actualMap.get(k) ?? null,
        skipped: plan?.skipped ?? false,
        adjusted: budgeted !== toCents(item.plannedAmount),
        half: halfFor(item.dueDay, item.periodAssignment as never, splitDay),
        paidFromSurplus: false,
        carriedFrom: null,
      };
    })
    .sort((a, b) => (a.dueDay ?? 0) - (b.dueDay ?? 0));

  const carriedCents = carried.reduce((sum, e) => sum + e.budgetedCents, 0);

  const billsBalanceCents = balance ? toCents(balance.amount) : null;
  const billsBalanceFrom = balance ? { year: balance.year, month: balance.month } : null;
  // Anything already overdue is owed now, so it weighs on the first half.
  const remainingFirst = halves[0].remainingCents + carriedCents;
  const remainingBoth = remainingFirst + halves[1].remainingCents;

  return {
    year,
    month,
    splitDay,
    halves,
    surplusItems: surplus,
    surplusBudgetedCents: surplus.reduce((sum, e) => sum + e.budgetedCents, 0),
    surplusPaidCents: surplus.reduce((sum, e) => sum + (e.actualCents ?? 0), 0),
    carried,
    carriedCents,
    carryMonths: settings.carryMonths,
    income,
    incomeExpectedCents: income.reduce((s, e) => s + e.budgetedCents, 0),
    incomeReceivedCents: income.reduce((s, e) => s + (e.actualCents ?? 0), 0),
    billsBalanceCents,
    billsBalanceFrom,
    billsAccountId: settings.billsAccountId,
    billsAccountName: settings.billsAccountId
      ? (accountName.get(settings.billsAccountId) ?? null)
      : null,
    transferAfterFirstCents:
      billsBalanceCents === null ? null : billsBalanceCents - remainingFirst,
    transferAfterSecondCents:
      billsBalanceCents === null ? null : billsBalanceCents - remainingBoth,
    totalBudgetedCents: halves[0].budgetedCents + halves[1].budgetedCents,
    totalPaidCents: halves[0].paidCents + halves[1].paidCents,
    totalRemainingCents: remainingBoth,
    carriedCount: carried.length,
  };
}

function monthsBetween(
  earliest: Date,
  year: number,
  month: number,
): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = earliest.getUTCFullYear();
  let m = earliest.getUTCMonth() + 1;

  while (y * 12 + m <= year * 12 + month) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- mutations

/** Records what was actually paid. Its presence settles the item for the month. */
export async function recordActual(
  lineItemId: string,
  year: number,
  month: number,
  amountCents: Cents,
  note?: string,
): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new ValidationError({ amount: ["Enter an amount of zero or more"] });
  }
  const item = await prisma.lineItem.findUnique({ where: { id: lineItemId } });
  if (!item) throw new ValidationError({ lineItemId: ["No such line item"] });

  await prisma.actualEntry.upsert({
    where: { lineItemId_year_month: { lineItemId, year, month } },
    create: {
      lineItemId,
      year,
      month,
      amount: toDecimalString(amountCents),
      note: note || null,
      source: "manual",
    },
    update: { amount: toDecimalString(amountCents), note: note || null },
  });
}

/** Undoes a recorded payment, returning the item to unpaid. */
export async function clearActual(
  lineItemId: string,
  year: number,
  month: number,
): Promise<void> {
  await prisma.actualEntry
    .delete({ where: { lineItemId_year_month: { lineItemId, year, month } } })
    .catch(() => undefined);
}

/**
 * Adjusts one month's budgeted amount without touching the plan behind it, or
 * marks the month as nothing owed.
 */
export async function adjustMonth(
  lineItemId: string,
  year: number,
  month: number,
  options: { amountCents?: Cents | null; skipped?: boolean },
): Promise<void> {
  const item = await prisma.lineItem.findUnique({ where: { id: lineItemId } });
  if (!item) throw new ValidationError({ lineItemId: ["No such line item"] });

  const { amountCents, skipped = false } = options;

  if (amountCents !== null && amountCents !== undefined) {
    if (!Number.isInteger(amountCents) || amountCents < 0) {
      throw new ValidationError({ amount: ["Enter an amount of zero or more"] });
    }
  }

  // Nothing to store: no override and not skipped means fall back to the plan.
  if ((amountCents === null || amountCents === undefined) && !skipped) {
    await prisma.monthlyPlan
      .delete({ where: { lineItemId_year_month: { lineItemId, year, month } } })
      .catch(() => undefined);
    return;
  }

  const amount = amountCents === null || amountCents === undefined
    ? null
    : toDecimalString(amountCents);

  await prisma.monthlyPlan.upsert({
    where: { lineItemId_year_month: { lineItemId, year, month } },
    create: { lineItemId, year, month, amount, skipped },
    update: { amount, skipped },
  });
}

/** Records the balance set aside for bills in a given month. */
export async function recordBillsBalance(
  year: number,
  month: number,
  amountCents: Cents,
): Promise<void> {
  const settings = await getSettings();
  if (!settings.billsAccountId) {
    throw new ValidationError({
      billsAccountId: ["Choose a bills account in preferences first"],
    });
  }

  await prisma.balanceSnapshot.upsert({
    where: {
      accountId_year_month: { accountId: settings.billsAccountId, year, month },
    },
    create: {
      accountId: settings.billsAccountId,
      year,
      month,
      amount: toDecimalString(amountCents),
    },
    update: { amount: toDecimalString(amountCents), asOf: new Date() },
  });
}
