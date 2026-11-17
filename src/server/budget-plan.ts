/**
 * Gathers the numbers for the budget plan (src/lib/budget-plan.ts): the plan's
 * income and bills (and which card each bill lands on), the 0% payoffs, and
 * three complete months of everyday spending and bill charges per account.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { SPENDING_TYPES, displayAccountName, type AccountType } from "@/lib/account-type";
import { isIncomeCategory } from "@/lib/category-guess";
import { lastCloseDate } from "@/lib/card-payment";
import { allowance } from "@/lib/allowance";
import { budgetPlan, type BudgetPlan, type CardInput } from "@/lib/budget-plan";
import { loadPlan } from "./allowance";
import { getInsights } from "./insights";
import { payoffTrackers } from "./card-payments";
import { billCharge } from "./bill-merchants";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ym = (year: number, month: number) => year * 12 + (month - 1);
const avg12 = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / 12);

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function getBudgetPlan(): Promise<BudgetPlan | null> {
  const plan = await loadPlan();
  if (!plan) return null;
  const { year, month, rows } = plan;
  const today = localToday();
  const end = ym(year, month);
  const complete = [end - 3, end - 2, end - 1];

  const [insights, payoff, accounts, items] = await Promise.all([
    getInsights(year, month),
    payoffTrackers(),
    prisma.bankAccount.findMany({
      where: { hidden: false },
      select: { id: true, name: true, nickname: true, type: true, balance: true, statementCloseDay: true, promoEndsOn: true, cardColor: true },
    }) as Promise<Array<{ id: string; name: string; nickname: string | null; type: AccountType; balance: { toString(): string } | null; statementCloseDay: number | null; promoEndsOn: Date | null; cardColor: string | null }>>,
    prisma.lineItem.findMany({ select: { id: true, chargedTo: { select: { bankAccount: { select: { id: true } } } } } }) as Promise<
      Array<{ id: string; chargedTo: { bankAccount: { id: string } | null } | null }>
    >,
  ]);

  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  // 0% cards are being paid down, not spent on: they stay out of the card budget.
  const promo = new Set(cards.filter((c) => c.promoEndsOn && iso(c.promoEndsOn) >= today).map((c) => c.id));
  const budgetCards = cards.filter((c) => !promo.has(c.id));

  // Where each bill lands: the card it's charged to, else the account its recent payments came from.
  const since = new Date(Date.UTC(year, month - 1 - 4, 1));
  const recentActuals = (await prisma.actualEntry.findMany({
    where: { bankTransactionId: { not: null }, bankTransaction: { postedOn: { gte: since } } },
    select: { lineItemId: true, bankTransaction: { select: { accountId: true, postedOn: true } } },
    orderBy: { bankTransaction: { postedOn: "desc" } },
  })) as Array<{ lineItemId: string; bankTransaction: { accountId: string; postedOn: Date } | null }>;
  const paidFrom = new Map<string, string>();
  for (const a of recentActuals) if (a.bankTransaction && !paidFrom.has(a.lineItemId)) paidFrom.set(a.lineItemId, a.bankTransaction.accountId);
  const chargedTo = new Map(items.map((i) => [i.id, i.chargedTo?.bankAccount?.id ?? null]));
  const cardIds = new Set(cards.map((c) => c.id));
  const billsByCard = new Map<string, number>();
  let bankBills = 0;
  for (const r of rows) {
    if (r.kind === "INCOME" || r.cardPayment) continue;
    const monthly = avg12(r.months);
    const where = chargedTo.get(r.lineItemId) ?? paidFrom.get(r.lineItemId) ?? null;
    if (where && cardIds.has(where)) billsByCard.set(where, (billsByCard.get(where) ?? 0) + monthly);
    else bankBills += monthly;
  }

  // Everyday spending and bill charges per account, per month, from the bank.
  const periodFrom = new Map(
    budgetCards.map((c) => [c.id, c.statementCloseDay ? lastCloseDate(today, c.statementCloseDay) : `${today.slice(0, 8)}01`]),
  );
  const txns = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: new Date(Date.UTC(year, month - 1 - 3, 1) - 40 * DAY) }, kind: "NORMAL", pending: false, account: { hidden: false } },
    select: {
      postedOn: true, amount: true, accountId: true, categoryId: true, merchant: true,
      account: { select: { type: true } },
      category: { select: { name: true, managedForOthers: true } },
      actual: { select: { id: true } },
    },
  })) as Array<{ postedOn: Date; amount: { toString(): string }; accountId: string; categoryId: string | null; merchant: string; account: { type: AccountType }; category: { name: string; managedForOthers: boolean } | null; actual: { id: string } | null }>;

  const isBill = await billCharge();
  const spend = new Map<string, number>(); // `${accountId}:${n}`
  const bill = new Map<string, number>();
  const sinceSpend = new Map<string, number>();
  const sinceBill = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const t of txns) {
    if (t.category?.managedForOthers || !SPENDING_TYPES.includes(t.account.type)) continue;
    const cents = toCents(t.amount);
    const n = ym(t.postedOn.getUTCFullYear(), t.postedOn.getUTCMonth() + 1);
    const day = iso(t.postedOn);
    const from = periodFrom.get(t.accountId);
    const inPeriod = from !== undefined && day > from;
    if (cents < 0 && isBill(t)) {
      add(bill, `${t.accountId}:${n}`, -cents);
      if (inPeriod) add(sinceBill, t.accountId, -cents);
      continue;
    }
    const refund = cents > 0 && (t.account.type === "CREDIT_CARD" || (t.categoryId !== null && !isIncomeCategory(t.category?.name)));
    if (cents > 0 && (!refund || isBill(t))) continue;
    add(spend, `${t.accountId}:${n}`, -cents);
    if (inPeriod) add(sinceSpend, t.accountId, -cents);
  }
  const series = (m: Map<string, number>, id: string) => complete.map((n) => m.get(`${id}:${n}`) ?? 0);
  const sumSeries = (ids: string[], m: Map<string, number>) => complete.map((n) => ids.reduce((s, id) => s + (m.get(`${id}:${n}`) ?? 0), 0));

  const cardInputs: CardInput[] = budgetCards.map((c) => ({
    id: c.id,
    name: c.nickname || displayAccountName(c.name),
    color: c.cardColor,
    billsCents: billsByCard.get(c.id) ?? 0,
    recentSpending: series(spend, c.id),
    recentBills: series(bill, c.id),
    periodFrom: periodFrom.get(c.id)!,
    periodIsStatement: !!c.statementCloseDay,
    sinceBillsCents: sinceBill.get(c.id) ?? 0,
    sinceSpendingCents: sinceSpend.get(c.id) ?? 0,
    balanceCents: c.balance === null ? 0 : Math.max(0, -toCents(c.balance)),
  }));
  // A card with no use at all in three months says nothing about the budget.
  const usedCards = cardInputs.filter((c) => c.billsCents > 0 || c.recentSpending.some((x) => x > 0) || c.balanceCents > 0);

  const checking = accounts.filter((a) => a.type !== "CREDIT_CARD").map((a) => a.id);
  const months = insights.months.slice(-4, -1).filter((m) => m.everydayCents > 0);
  const deposits = months.length ? Math.round(months.reduce((s, m) => s + m.inCents, 0) / months.length) : 0;
  const income = allowance({ rows, payoffCents: 0, depositsCents: deposits, recentEveryday: [], recentOnCards: [], spentCents: 0, projectedCents: null, day: 1, daysInMonth: 30 });

  return budgetPlan({
    incomeCents: income.incomeCents,
    incomeSource: income.incomeSource,
    bankBillsCents: bankBills + [...billsByCard].filter(([id]) => promo.has(id)).reduce((s, [, v]) => s + v, 0),
    payoffCents: payoff.reduce((s, p) => s + p.monthlyCents, 0),
    recentDebit: sumSeries(checking, spend),
    recentOtherCards: sumSeries([...promo], spend),
    cards: usedCards,
    categories: insights.categories.map((c) => ({ id: c.id, name: c.name, recent: [c.averageCents], monthCents: c.cents })),
    monthSpentCents: insights.current.everydayCents,
    day: Number(today.slice(8, 10)),
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  });
}
