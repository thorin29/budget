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

import { cache } from "react";
import { keepUntilChanged } from "@/lib/data-version";
import { loadPaydays, monthSplit } from "./pay-split";
import { periodBounds, periodIndex } from "@/lib/pay-periods";
import { accountLabels } from "./bank/ledger";
import { safeHttpUrl } from "@/lib/safe-url";
import { prisma } from "@/lib/prisma";
import { toCents, toDecimalString, type Cents } from "@/lib/money";
import { ChangedElsewhereError, ValidationError } from "./errors";
import { sameNameTags } from "@/lib/same-names";
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
import { attachPendingCharges } from "./bill-pending";

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
  /** When it was paid, as YYYY-MM-DD, if that was recorded. */
  paidOn: string | null;
  /** Explicitly nothing owed this month — distinct from zero. */
  skipped: boolean;
  /** True when the month's budget differs from the plan. */
  adjusted: boolean;
  half: 0 | 1;
  /** Paid from what is left over; kept out of the cash figures. */
  paidFromSurplus: boolean;
  /** Set when the entry originates in an earlier, unpaid month. */
  carriedFrom: { year: number; month: number } | null;
  /** Recorded on its own from an exact bank match. */
  autoPaid?: boolean;
  /** The payment is tied to a bank charge. */
  bankLinked?: boolean;
  /** Unpaid, but its payment is already in the bank feed (pending, or waiting to be matched). */
  pendingCharge?: { txnId: string; cents: number; postedOn: string; pending: boolean };
}

export interface HalfSummary {
  half: MonthHalf;
  entries: MonthEntry[];
  budgetedCents: Cents;
  paidCents: Cents;
  /** Budgeted total of everything in this half still unpaid. */
  remainingCents: Cents;
}

/** One paycheck's share of the month (Pay Settings › Tracker periods: per paycheck). */
export interface PayPeriod {
  /** YYYY-MM-DD, within the month. */
  start: string;
  end: string;
  /** The payday that starts it; null for the days before the month's first payday. */
  payday: string | null;
  /** For the days before the first payday: the last payday of the month before, whose pay covers them. */
  fromPayday: string | null;
  /** Pay expected on that payday. */
  incomeCents: Cents;
  entries: MonthEntry[];
  budgetedCents: Cents;
  paidCents: Cents;
  remainingCents: Cents;
  /** Today is in it. */
  current: boolean;
}

export interface MonthView {
  year: number;
  month: number;
  splitDay: number;
  /** The payday the month divides at, when it follows the pay calendar. */
  splitPayday: string | null;
  /** Which of the month's paydays that is (1 = the first), for "after the second payday". */
  splitPaydayNumber: number | null;
  /** The month isn't divided (Pay Settings): one period, shown as "This Month". */
  wholeMonth: boolean;
  /** One period per paycheck, when Pay Settings asks for it (null otherwise). */
  periods: PayPeriod[] | null;
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
  /** When the balance was last set, by hand or by the bank. */
  billsBalanceAsOf: string | null;
  /** The bills account follows a bank account, so the balance updates with each sync. */
  billsBalanceFromBank: boolean;
  /** The last good bank sync, when bank sync is connected. */
  bankSyncedAt: string | null;
  /** When the bridge last got the bills account from the bank (its balance date). */
  billsBankDataAt: string | null;
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
  paydayNumber?: number | null;
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
  note?: string | null;
}

interface ActualRow {
  lineItemId: string;
  year: number;
  month: number;
  amount: { toString(): string };
  paidOn: Date | null;
  source?: string;
  bankTransactionId?: string | null;
}

/** The month, worked out once per page load however many parts of the page ask for it. */
export const getMonthView = cache(keepUntilChanged("month", (year: number, month: number): Promise<MonthView> => buildMonthView(year, month), () => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC" }).format(new Date())));

async function buildMonthView(year: number, month: number): Promise<MonthView> {
  const settings = await getSettings();
  const paydaysIn = await loadPaydays();
  const split = await monthSplit(year, month, settings, paydaysIn);
  const splitDay = split.splitDay;

  const [items, categories, accounts] = (await Promise.all([
    // Inactive items still show in a month they were paid, so the month matches the Year view.
    prisma.lineItem.findMany({ where: { OR: [{ active: true }, { actuals: { some: { year, month } } }] } }),
    prisma.category.findMany(),
    prisma.account.findMany(),
  ])) as [LineItemRow[], NamedRow[], NamedRow[]];

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = await accountLabels();

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
    { amount: { toString(): string }; year: number; month: number; asOf: Date } | null,
  ];
  const [linkedBank, connection] = (await Promise.all([
    settings.billsAccountId
      ? prisma.bankAccount.findFirst({ where: { linkedAccountId: settings.billsAccountId, hidden: false }, select: { id: true, balanceDate: true } })
      : null,
    prisma.bankConnection.findUnique({ where: { id: "default" }, select: { lastSuccessAt: true } }),
  ])) as [{ id: string; balanceDate: Date | null } | null, { lastSuccessAt: Date | null } | null];

  const planMap = new Map(
    plans.map((p) => [
      key(p.lineItemId, p.year, p.month),
      { amountCents: p.amount === null ? null : toCents(p.amount), skipped: p.skipped },
    ]),
  );
  const actualMap = new Map(
    actuals.map((a) => [key(a.lineItemId, a.year, a.month), toCents(a.amount)]),
  );
  // Months that keep an earlier rate (the usual amount changed later) aren't one-month changes.
  const rateKeys = new Set(plans.filter((p) => p.note === "rate").map((p) => key(p.lineItemId, p.year, p.month)));
  const autoPaid = new Set(actuals.filter((a) => a.source === "auto").map((a) => key(a.lineItemId, a.year, a.month)));
  const bankLinked = new Set(actuals.filter((a) => a.bankTransactionId).map((a) => key(a.lineItemId, a.year, a.month)));
  const paidOnMap = new Map(
    actuals.map((a) => [
      key(a.lineItemId, a.year, a.month),
      a.paidOn ? a.paidOn.toISOString().slice(0, 10) : null,
    ]),
  );
  const settled = new Set(actuals.map((a) => key(a.lineItemId, a.year, a.month)));

  const shown = sameNameTags(items.map((i) => ({ id: i.id, name: i.name, dueDay: i.dueDay, paydayNumber: (i as { paydayNumber?: number | null }).paydayNumber ?? null, active: i.active })));
  const forModel: LineItemForMonth[] = items.map((i) => ({
    id: i.id,
    name: shown.get(i.id) ?? i.name,
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
    paydayNumber: i.paydayNumber ?? null,
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
      name: shown.get(item.id) ?? item.name,
      year: o.year,
      month: o.month,
      kind: item.kind as MonthEntry["kind"],
      categoryName: item.categoryId ? (categoryName.get(item.categoryId) ?? null) : null,
      accountName: item.paidFromId ? (accountName.get(item.paidFromId) ?? null) : null,
      paymentUrl: safeHttpUrl(item.paymentUrl),
      dueDay: item.dueDay,
      budgetedCents: o.amountCents,
      plannedCents: planned.get(item.id) ?? 0,
      actualCents: null,
      paidOn: null,
      skipped: false,
      adjusted: o.amountCents !== (planned.get(item.id) ?? 0) && !rateKeys.has(key(item.id, o.year, o.month)),
      half: o.half,
      paidFromSurplus: item.paidFromSurplus,
      carriedFrom: o.carriedOver ? { year: o.year, month: o.month } : null,
    };
  });

  // Paid items for this month, which buildObligations deliberately omits.
  for (const item of items) {
    if (item.kind === "INCOME") continue;
    // Paid in a month outside its schedule: still shown, so the month adds up to what was paid.
    const k = key(item.id, year, month);
    const actual = actualMap.get(k);
    if (actual === undefined) continue;

    const plan = planMap.get(k);
    const budgeted = plan?.amountCents ?? planned.get(item.id) ?? 0;

    entries.push({
      lineItemId: item.id,
      name: shown.get(item.id) ?? item.name,
      year,
      month,
      kind: item.kind as MonthEntry["kind"],
      categoryName: item.categoryId ? (categoryName.get(item.categoryId) ?? null) : null,
      accountName: item.paidFromId ? (accountName.get(item.paidFromId) ?? null) : null,
      paymentUrl: safeHttpUrl(item.paymentUrl),
      dueDay: item.dueDay,
      budgetedCents: budgeted,
      plannedCents: planned.get(item.id) ?? 0,
      actualCents: actual,
      paidOn: paidOnMap.get(k) ?? null,
      autoPaid: autoPaid.has(k),
      bankLinked: bankLinked.has(k),
      skipped: plan?.skipped ?? false,
      adjusted: budgeted !== (planned.get(item.id) ?? 0) && !rateKeys.has(k),
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
    .filter((i) => isDueInMonth(forModel.find((f) => f.id === i.id)!, year, month, paydaysIn) || actualMap.has(key(i.id, year, month)))
    .map((item) => {
      const k = key(item.id, year, month);
      const plan = planMap.get(k);
      const budgeted = plan?.amountCents ?? toCents(item.plannedAmount);
      // Tied to a payday: it arrives on that payday this month.
      const payday = item.paydayNumber ? paydaysIn(year, month)[item.paydayNumber - 1] : undefined;
      return {
        lineItemId: item.id,
        name: shown.get(item.id) ?? item.name,
        year,
        month,
        kind: "INCOME" as const,
        categoryName: item.categoryId ? (categoryName.get(item.categoryId) ?? null) : null,
        accountName: item.paidFromId ? (accountName.get(item.paidFromId) ?? null) : null,
        paymentUrl: safeHttpUrl(item.paymentUrl),
        dueDay: payday ? payday.getUTCDate() : item.dueDay,
        budgetedCents: budgeted,
        plannedCents: toCents(item.plannedAmount),
        actualCents: actualMap.get(k) ?? null,
        paidOn: paidOnMap.get(k) ?? null,
        autoPaid: autoPaid.has(k),
        bankLinked: bankLinked.has(k),
        skipped: plan?.skipped ?? false,
        adjusted: budgeted !== toCents(item.plannedAmount) && !rateKeys.has(k),
        half: halfFor(item.dueDay, item.periodAssignment as never, splitDay),
        paidFromSurplus: false,
        carriedFrom: null,
      };
    })
    // Nothing expected and nothing received (a year-end bonus outside its month): not worth a row.
    .filter((e) => e.budgetedCents > 0 || e.actualCents !== null)
    .sort((a, b) => (a.dueDay ?? 0) - (b.dueDay ?? 0));

  // Per paycheck: the same bills, grouped by the pay period their due day falls in.
  let periods: PayPeriod[] | null = null;
  if (settings.splitMode === "paycheck") {
    const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const bounds = periodBounds(paydaysIn(year, month).map((d) => d.getUTCDate()), dim);
    const iso = (d: number) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const todayIso = new Date().toISOString().slice(0, 10);
    const prev = paydaysIn(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1).at(-1);
    periods = bounds.map((b) => ({ start: iso(b.startDay), end: iso(b.endDay), payday: b.payday ? iso(b.payday) : null, fromPayday: !b.payday && prev ? prev.toISOString().slice(0, 10) : null, incomeCents: 0, entries: [] as MonthEntry[], budgetedCents: 0, paidCents: 0, remainingCents: 0, current: todayIso >= iso(b.startDay) && todayIso <= iso(b.endDay) }));
    for (const e of [...thisMonth].sort((a, b) => (a.dueDay ?? 0) - (b.dueDay ?? 0))) {
      const p = periods[periodIndex(bounds, e.dueDay)];
      p.entries.push(e);
      p.budgetedCents += e.budgetedCents;
      p.paidCents += e.actualCents ?? 0;
      if (e.actualCents === null) p.remainingCents += e.budgetedCents;
    }
    for (const e of income) {
      const p = periods[periodIndex(bounds, e.dueDay)];
      if (p) p.incomeCents += e.budgetedCents;
    }
  }

  const carriedCents = carried.reduce((sum, e) => sum + e.budgetedCents, 0);
  await attachPendingCharges([...carried, ...thisMonth, ...surplus], new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC" }).format(new Date()));

  const billsBalanceCents = balance ? toCents(balance.amount) : null;
  const billsBalanceFrom = balance ? { year: balance.year, month: balance.month } : null;
  // Anything already overdue is owed now, so it weighs on the first half.
  const remainingFirst = halves[0].remainingCents + carriedCents;
  const remainingBoth = remainingFirst + halves[1].remainingCents;

  return {
    year,
    month,
    splitDay,
    splitPayday: split.payday,
    splitPaydayNumber: split.payday ? paydaysIn(year, month).findIndex((d) => d.toISOString().slice(0, 10) === split.payday) + 1 || null : null,
    wholeMonth: settings.splitMode === "none",
    periods,
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
    billsBalanceAsOf: balance ? balance.asOf.toISOString() : null,
    billsBalanceFromBank: linkedBank !== null,
    bankSyncedAt: connection?.lastSuccessAt ? connection.lastSuccessAt.toISOString() : null,
    billsBankDataAt: linkedBank?.balanceDate ? linkedBank.balanceDate.toISOString() : null,
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

/**
 * Refuses a write entered before the stored value last changed. `enteredAt` is
 * when the person pressed Confirm on the phone; a queued offline write keeps
 * it, so if the web changed the entry after that, the stale write is refused.
 * Two minutes of grace absorbs clock drift between phone and server.
 */
const CLOCK_GRACE_MS = 2 * 60_000;
function assertNotStale(storedAt: Date | null | undefined, enteredAt: Date | undefined) {
  if (!storedAt || !enteredAt) return;
  if (storedAt.getTime() > enteredAt.getTime() + CLOCK_GRACE_MS) throw new ChangedElsewhereError();
}

/** Records what was actually paid. Its presence settles the item for the month. */
export async function recordActual(
  lineItemId: string,
  year: number,
  month: number,
  amountCents: Cents,
  note?: string,
  paidOn?: Date | null,
  recordedById?: string,
  enteredAt?: Date,
): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new ValidationError({ amount: ["Enter an amount of zero or more"] });
  }
  const item = await prisma.lineItem.findUnique({ where: { id: lineItemId } });
  if (!item) throw new ValidationError({ lineItemId: ["No such line item"] });

  if (enteredAt) {
    const current = (await prisma.actualEntry.findUnique({
      where: { lineItemId_year_month: { lineItemId, year, month } },
      select: { updatedAt: true },
    })) as { updatedAt: Date } | null;
    assertNotStale(current?.updatedAt, enteredAt);
  }

  await prisma.actualEntry.upsert({
    where: { lineItemId_year_month: { lineItemId, year, month } },
    create: {
      lineItemId,
      year,
      month,
      amount: toDecimalString(amountCents),
      paidOn: paidOn ?? null,
      note: note || null,
      source: "manual",
      recordedById: recordedById ?? null,
    },
    update: {
      amount: toDecimalString(amountCents),
      note: note || null,
      // Left alone when not supplied, so an edit elsewhere keeps the date.
      ...(paidOn === undefined ? {} : { paidOn }),
      ...(recordedById ? { recordedById } : {}),
    },
  });
}

/** Undoes a recorded payment, returning the item to unpaid. */
export async function clearActual(
  lineItemId: string,
  year: number,
  month: number,
  enteredAt?: Date,
): Promise<void> {
  if (enteredAt) {
    const current = (await prisma.actualEntry.findUnique({
      where: { lineItemId_year_month: { lineItemId, year, month } },
      select: { updatedAt: true },
    })) as { updatedAt: Date } | null;
    assertNotStale(current?.updatedAt, enteredAt);
  }
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
    // Changed by hand: no longer just the earlier rate.
    update: { amount, skipped, note: null },
  });
}

/** Records the balance set aside for bills in a given month. */
export async function recordBillsBalance(
  year: number,
  month: number,
  amountCents: Cents,
  enteredAt?: Date,
): Promise<void> {
  const settings = await getSettings();
  if (!settings.billsAccountId) {
    throw new ValidationError({
      billsAccountId: ["Choose a bills account in preferences first"],
    });
  }

  if (enteredAt) {
    const current = (await prisma.balanceSnapshot.findUnique({
      where: { accountId_year_month: { accountId: settings.billsAccountId, year, month } },
      select: { asOf: true },
    })) as { asOf: Date } | null;
    assertNotStale(current?.asOf, enteredAt);
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
