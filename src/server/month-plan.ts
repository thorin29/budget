/**
 * The month's spending plan (src/lib/month-plan.ts), gathered for one
 * calendar month: money in and bills from the month view, the debt payment,
 * spending by budget from the bank, usual spending from the twelve months
 * before, and every item behind each total so any number can be opened.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { SPENDING_TYPES, type AccountType } from "@/lib/account-type";
import { isIncomeCategory } from "@/lib/category-guess";
import { cardByName } from "@/lib/card-links";
import { monthPlan, planTier, type GroupTier, type MonthPlanOut, type PlanTier } from "@/lib/month-plan";
import { OTHER_GROUP } from "@/lib/envelope-defaults";
import { getMonthView, type MonthEntry } from "./month";
import { payoffTrackers } from "./card-payments";
import { billCharge } from "./bill-merchants";
import { ensureGroups, debtSetting } from "./envelopes";

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** A credit on a card, or money leaving checking, that reads like a card payment. */
const PAYMENT_WORDS = /\b(payment|pymt|pmt|thank you|autopay|auto pay|epay|online pmt|crcardpmt|card pmt)\b/i;
/** Under this much safe to spend, the month is running low. */
export const LOW_CENTS = 20_000;
const UNCATEGORIZED = { id: "uncategorized", name: "Needs a category" };

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export interface PlanTxn {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
  /** Spending is positive; a refund is negative. */
  cents: number;
  pending: boolean;
  /** Part of a charge split by item (an Amazon order). */
  split: boolean;
}

export interface PlanBill {
  lineItemId: string;
  name: string;
  /** YYYY-MM-DD */
  dueOn: string;
  cents: number;
  status: "paid" | "due" | "overdue" | "skipped";
  paidOn: string | null;
  /** The month it's from, when it's an unpaid bill carried from an earlier month. */
  from: string | null;
}

export interface PlanGroup {
  id: string;
  name: string;
  /** "SORT" for spending that needs a category or a budget. */
  tier: PlanTier | "SORT";
  manualCents: number | null;
  usualCents: number;
  limitCents: number | null;
  automatic: boolean;
  spentCents: number;
  leftCents: number | null;
  overCents: number;
  roomCents: number | null;
  categories: Array<{ id: string | null; name: string; spentCents: number; transactions: PlanTxn[] }>;
}

export interface MonthPlanView extends Omit<MonthPlanOut, "groups"> {
  /** YYYY-MM */
  month: string;
  today: string;
  /** The month is over. */
  closed: boolean;
  daysLeft: number;
  daysInMonth: number;
  income: { totalCents: number; receivedCents: number; items: Array<{ lineItemId: string; name: string; dueOn: string; cents: number; received: boolean }> };
  bills: {
    totalCents: number;
    paidCents: number;
    items: PlanBill[];
    /** Charges in bill categories that aren't on the bill list. They count as bills. */
    otherCents: number;
    other: PlanTxn[];
  };
  debt: {
    cents: number;
    /** "set": the amount you set; "plan": the bill for that card; "paid": what was paid this month; "minimum": about 1% of the balance. */
    source: "set" | "plan" | "paid" | "minimum" | "none";
    name: string | null;
    dueOn: string | null;
    balanceCents: number | null;
    endsOn: string | null;
    /** What a month needs to clear it by the end of the 0% offer. */
    targetCents: number | null;
    /** The month it clears at this payment. YYYY-MM */
    doneIn: string | null;
  };
  standing: "ok" | "low" | "over";
  message: string | null;
  groups: PlanGroup[];
  /** Everything spent each day of the month (every budget), for the pace chart. */
  daily: Array<{ date: string; spentCents: number }>;
}

type Txn = {
  id: string;
  postedOn: Date;
  amount: { toString(): string };
  merchant: string;
  description: string;
  categoryId: string | null;
  pending: boolean;
  category: { name: string; managedForOthers: boolean } | null;
  account: { type: AccountType };
  actual: { id: string } | null;
  splits: Array<{ categoryId: string | null; amount: { toString(): string } }>;
};

const amount = (e: { skipped: boolean; actualCents: number | null; budgetedCents: number }) => (e.skipped ? 0 : (e.actualCents ?? e.budgetedCents));

export function dueIso(year: number, month: number, dueDay: number | null): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month - 1, Math.min(last, Math.max(1, dueDay ?? 1)))));
}

export type BillItem = { id: string; name: string; kind: string; paysCardId: string | null; paysCardLocked: boolean; paidFromSurplus: boolean };
export type CardRow = { id: string; name: string; nickname: string | null; institution: string | null; promoEndsOn: Date | null };

/**
 * Which bills pay a card: card payments aren't bills (the card's spending is
 * counted as it happens), except the 0% card's payment, which is the debt payment.
 */
export function billTypes(items: BillItem[], cards: CardRow[], today: string) {
  const byItem = new Map(items.map((i) => [i.id, i]));
  const cardNames = cards.map((c) => ({ id: c.id, names: [c.nickname ?? "", c.name, c.institution ?? ""] }));
  const promoCards = new Set(cards.filter((c) => c.promoEndsOn && iso(c.promoEndsOn) >= today).map((c) => c.id));
  const paysCard = (id: string): string | null | undefined => {
    const i = byItem.get(id);
    if (!i) return undefined;
    if (i.paysCardId) return i.paysCardId;
    if (!i.paysCardLocked && i.kind === "BILL") return cardByName(i.name, cardNames);
    return undefined;
  };
  const isCardPayment = (id: string) => {
    const i = byItem.get(id);
    return !!i && (i.kind === "SETTLEMENT" || i.paidFromSurplus || !!paysCard(id));
  };
  const isDebt = (id: string) => {
    const card = paysCard(id);
    return !!card && promoCards.has(card);
  };
  return { isCardPayment, isDebt };
}

export async function getMonthPlan(year?: number, month?: number): Promise<MonthPlanView> {
  await ensureGroups();
  const today = localToday();
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const nowN = ty * 12 + tm;
  // Never a month that hasn't started.
  const asked = year !== undefined && month !== undefined && year * 12 + month <= nowN;
  const y = asked ? year! : ty;
  const m = asked ? month! : tm;
  const n = y * 12 + m;
  const closed = n < nowN;
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 1));
  const windowStart = new Date(Date.UTC(y, m - 1 - 12, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysLeft = closed ? 0 : daysInMonth - Number(today.slice(8, 10)) + 1;

  const [view, items, cards, groups, categories, txns, isBill, debtSet, trackers] = await Promise.all([
    getMonthView(y, m),
    prisma.lineItem.findMany({ select: { id: true, name: true, kind: true, paysCardId: true, paysCardLocked: true, paidFromSurplus: true } }) as Promise<
      Array<{ id: string; name: string; kind: string; paysCardId: string | null; paysCardLocked: boolean; paidFromSurplus: boolean }>
    >,
    prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD", hidden: false }, select: { id: true, name: true, nickname: true, institution: true, promoEndsOn: true } }) as Promise<
      Array<{ id: string; name: string; nickname: string | null; institution: string | null; promoEndsOn: Date | null }>
    >,
    prisma.categoryGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) as Promise<Array<{ id: string; name: string; tier: GroupTier; limitCents: number | null }>>,
    prisma.category.findMany({ select: { id: true, name: true, groupId: true, managedForOthers: true } }) as Promise<Array<{ id: string; name: string; groupId: string | null; managedForOthers: boolean }>>,
    prisma.bankTransaction.findMany({
      where: { postedOn: { gte: windowStart, lt: monthEnd }, kind: "NORMAL", account: { hidden: false } },
      select: {
        id: true, postedOn: true, amount: true, merchant: true, description: true, categoryId: true, pending: true,
        category: { select: { name: true, managedForOthers: true } },
        account: { select: { type: true } },
        actual: { select: { id: true } },
        splits: { select: { categoryId: true, amount: true } },
      },
      orderBy: { postedOn: "desc" },
    }) as Promise<Txn[]>,
    billCharge(),
    debtSetting(),
    payoffTrackers(today).catch(() => []),
  ]);

  const { isCardPayment, isDebt } = billTypes(items, cards, today);

  // ---- money in
  const income = view.income
    .filter((e) => !e.skipped)
    .map((e) => ({ lineItemId: e.lineItemId, name: e.name, dueOn: dueIso(e.year, e.month, e.dueDay), cents: amount(e), received: e.actualCents !== null }));
  const incomeCents = income.reduce((s, e) => s + e.cents, 0);

  // ---- bills: everything due this month, whole, plus unpaid ones carried from before
  const status = (e: MonthEntry): PlanBill["status"] =>
    e.skipped ? "skipped" : e.actualCents !== null ? "paid" : dueIso(e.year, e.month, e.dueDay) < today ? "overdue" : "due";
  const billItems: PlanBill[] = [];
  const debtEntries: MonthEntry[] = [];
  for (const e of [...view.halves[0].entries, ...view.halves[1].entries]) {
    if (e.kind === "INCOME") continue;
    if (isDebt(e.lineItemId)) {
      debtEntries.push(e);
      continue;
    }
    if (isCardPayment(e.lineItemId)) continue;
    billItems.push({ lineItemId: e.lineItemId, name: e.name, dueOn: dueIso(e.year, e.month, e.dueDay), cents: amount(e), status: status(e), paidOn: e.paidOn, from: null });
  }
  for (const e of view.carried) {
    if (e.kind === "INCOME" || isCardPayment(e.lineItemId) || e.actualCents !== null || e.skipped) continue;
    billItems.push({
      lineItemId: e.lineItemId, name: e.name, dueOn: dueIso(e.year, e.month, e.dueDay), cents: e.budgetedCents, status: "overdue", paidOn: null,
      from: `${e.year}-${String(e.month).padStart(2, "0")}`,
    });
  }
  billItems.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name));

  // ---- the debt payment, monthly
  const balance = trackers.length ? trackers.reduce((s, t) => s + t.balanceCents, 0) : null;
  const paidDebt = debtEntries.filter((e) => e.actualCents !== null).reduce((s, e) => s + (e.actualCents ?? 0), 0);
  const plannedDebt = debtEntries.filter((e) => !e.skipped).reduce((s, e) => s + e.budgetedCents, 0);
  let debtSource: MonthPlanView["debt"]["source"] = "none";
  let debtCents = 0;
  if (paidDebt > 0 && debtEntries.every((e) => e.actualCents !== null || e.skipped)) [debtCents, debtSource] = [paidDebt, "paid"];
  else if (debtSet !== null) [debtCents, debtSource] = [Math.max(debtSet, paidDebt), "set"];
  else if (plannedDebt > 0) [debtCents, debtSource] = [Math.max(plannedDebt, paidDebt), "plan"];
  else if (balance) [debtCents, debtSource] = [Math.ceil(balance / 100), "minimum"];
  const endsOn = trackers.length ? trackers.map((t) => t.endsOn).sort()[0] : null;
  // Payments left before the offer ends, counting from next month.
  const monthsToEnd = endsOn ? Math.max(1, Number(endsOn.slice(0, 4)) * 12 + Number(endsOn.slice(5, 7)) - nowN) : null;
  const doneIn = (() => {
    if (balance === null || balance <= 0 || debtCents <= 0) return null;
    const k = Math.ceil(balance / debtCents) - 1;
    const d = new Date(Date.UTC(ty, tm - 1 + k, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const debtDue = debtEntries[0] ? dueIso(debtEntries[0].year, debtEntries[0].month, debtEntries[0].dueDay) : null;

  // ---- spending by budget
  const tierOf = new Map(groups.map((g) => [g.id, planTier(g.tier)]));
  const groupOf = new Map(categories.map((c) => [c.id, c.groupId]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const ymn = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  const usualByMonth = new Map<string, Map<number, number>>();
  const spent = new Map<string, Map<string, { cents: number; txns: PlanTxn[] }>>(); // group -> category -> …
  const byDay = new Map<string, number>();
  const otherBills: PlanTxn[] = [];
  let firstMonth: number | null = null;
  // A card payment whose other side hasn't arrived yet isn't paired as a transfer: it's
  // still not spending (leaving checking) or a refund (reaching the card).
  const cardNames = cards.map((c) => ({ id: c.id, names: [c.nickname ?? "", c.name, c.institution ?? ""] }));
  const cardPayment = (t: Txn, cents: number) =>
    PAYMENT_WORDS.test(`${t.description} ${t.merchant}`) &&
    (t.account.type === "CREDIT_CARD" ? cents > 0 : cents < 0 && cardByName(`${t.merchant} ${t.description}`, cardNames) !== null);
  for (const t of txns) {
    if (t.category?.managedForOthers) continue;
    const cents = toCents(t.amount);
    const spending = SPENDING_TYPES.includes(t.account.type);
    if (!spending) continue;
    if (cardPayment(t, cents)) continue;
    let everyday = 0;
    if (cents < 0 && !isBill(t)) everyday = -cents;
    else if (cents > 0) {
      const refund = t.account.type === "CREDIT_CARD" || (t.categoryId !== null && !isIncomeCategory(t.category?.name));
      if (refund && !isBill(t)) everyday = -cents;
    }
    if (!everyday) continue;
    const parts = t.splits.length
      ? t.splits.map((s) => ({ categoryId: s.categoryId, cents: cents !== 0 ? Math.round((everyday * toCents(s.amount)) / cents) : 0 }))
      : [{ categoryId: t.categoryId, cents: everyday }];
    const inMonth = t.postedOn >= monthStart;
    for (const part of parts) {
      if (!part.cents) continue;
      const groupId = part.categoryId ? (groupOf.get(part.categoryId) ?? OTHER_GROUP.id) : UNCATEGORIZED.id;
      const tier = tierOf.get(groupId);
      const row: PlanTxn = { id: t.id, date: iso(t.postedOn), name: t.merchant, cents: part.cents, pending: t.pending, split: t.splits.length > 0 };
      if (tier === "BILLS") {
        if (inMonth) otherBills.push(row);
        continue;
      }
      if (inMonth) {
        byDay.set(row.date, (byDay.get(row.date) ?? 0) + part.cents);
        const g = spent.get(groupId) ?? new Map<string, { cents: number; txns: PlanTxn[] }>();
        const key = part.categoryId ?? "";
        const c = g.get(key) ?? { cents: 0, txns: [] };
        c.cents += part.cents;
        c.txns.push(row);
        g.set(key, c);
        spent.set(groupId, g);
      } else if (!t.pending) {
        const k = ymn(t.postedOn);
        const g = usualByMonth.get(groupId) ?? new Map<number, number>();
        g.set(k, (g.get(k) ?? 0) + part.cents);
        usualByMonth.set(groupId, g);
        if (firstMonth === null || k < firstMonth) firstMonth = k;
      }
    }
  }
  const history = firstMonth === null ? 1 : Math.max(1, Math.min(12, ymn(monthStart) - firstMonth));
  const usual = (id: string) => Math.round([...(usualByMonth.get(id)?.values() ?? [])].reduce((a, b) => a + b, 0) / history);
  const spentIn = (id: string) => [...(spent.get(id)?.values() ?? [])].reduce((s, c) => s + c.cents, 0);

  const otherCents = otherBills.reduce((s, t) => s + t.cents, 0);
  const billsCents = billItems.reduce((s, b) => s + b.cents, 0) + otherCents;

  // Budgets in the plan, then the spending still to sort (no guardrail; it counts against the month).
  const planGroups = groups
    .filter((g) => planTier(g.tier) !== "BILLS")
    .map((g) => ({ id: g.id, name: g.name, tier: planTier(g.tier) as PlanTier, manualCents: g.limitCents, usualCents: usual(g.id), spentCents: spentIn(g.id), sort: false }));
  for (const s of [OTHER_GROUP, UNCATEGORIZED]) {
    if (spent.has(s.id) || usual(s.id)) planGroups.push({ id: s.id, name: s.name, tier: "UNPLANNED", manualCents: null, usualCents: usual(s.id), spentCents: spentIn(s.id), sort: true });
  }

  const out = monthPlan({
    incomeCents,
    billsCents,
    debtCents,
    closed,
    groups: planGroups.map((g) => ({ id: g.id, tier: g.tier, manualCents: g.manualCents, usualCents: g.usualCents, spentCents: g.spentCents })),
  });
  const outById = new Map(out.groups.map((g) => [g.id, g]));

  const viewGroups: PlanGroup[] = planGroups.map((g) => {
    const o = outById.get(g.id)!;
    return {
      id: g.id,
      name: g.name,
      tier: g.sort ? "SORT" : g.tier,
      manualCents: g.manualCents,
      usualCents: g.usualCents,
      limitCents: o.limitCents,
      automatic: o.automatic,
      spentCents: o.spentCents,
      leftCents: o.leftCents,
      overCents: o.overCents,
      roomCents: o.roomCents,
      categories: [...(spent.get(g.id)?.entries() ?? [])]
        .map(([id, c]) => ({ id: id || null, name: id ? (categoryName.get(id) ?? "Category") : "Uncategorized", spentCents: c.cents, transactions: c.txns }))
        .sort((a, b) => b.spentCents - a.spentCents),
    };
  });

  const money = (c: number) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;
  const standing: MonthPlanView["standing"] = out.safeCents < 0 ? "over" : out.safeCents < LOW_CENTS && !closed ? "low" : "ok";
  let message: string | null = null;
  if (closed) {
    message = out.poolLeftCents < 0 ? `This month spent ${money(out.poolLeftCents)} more than it had after bills.` : null;
  } else if (out.safeCents < 0) {
    message = `Over by ${money(out.safeCents)}. Anything more, or groceries and fuel at their usual pace, lands on a card that can't be paid in full.`;
  } else if (out.shortCents > 0) {
    message = `The guardrails you set add up to ${money(out.shortCents)} more than the month has after bills.`;
  } else if (out.gapCents > 0) {
    message = `Usual spending is ${money(out.gapCents)} more than this month has after bills, so the extras' guardrails are smaller than usual.`;
  }

  return {
    month: `${y}-${String(m).padStart(2, "0")}`,
    today,
    closed,
    daysLeft,
    daysInMonth,
    income: { totalCents: incomeCents, receivedCents: income.filter((e) => e.received).reduce((s, e) => s + e.cents, 0), items: income },
    bills: {
      totalCents: billsCents,
      paidCents: billItems.filter((b) => b.status === "paid").reduce((s, b) => s + b.cents, 0) + otherCents,
      items: billItems,
      otherCents,
      other: otherBills,
    },
    debt: {
      cents: debtCents,
      source: debtSource,
      name: trackers.length === 1 ? trackers[0].name : trackers.length ? "0% balances" : null,
      dueOn: debtDue,
      balanceCents: balance,
      endsOn,
      targetCents: balance !== null && monthsToEnd ? Math.ceil(balance / monthsToEnd) : null,
      doneIn,
    },
    ...out,
    standing,
    message,
    groups: viewGroups,
    daily: Array.from({ length: daysInMonth }, (_, i) => {
      const date = iso(new Date(Date.UTC(y, m - 1, i + 1)));
      return { date, spentCents: byDay.get(date) ?? 0 };
    }),
  };
}
