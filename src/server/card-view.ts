/**
 * The budget split by where the money is paid: each credit card, and checking (bills paid from it
 * and debit purchases). Nothing here is new spending: every dollar is one already counted in the
 * month's sections, so the card rows add up to the page's totals.
 *
 *  - A card's bills are the bills that land on it (the card a bill is charged to, else the account
 *    its payments came from), plus bill-category charges made on it.
 *  - A card's share of a budget is where that budget's spending went over the twelve months
 *    before (Groceries all on one card, Shopping mostly on another). Its budget and the rest of
 *    the budget's projection follow that share; what it has spent is exact.
 *  - The statement view (statement-plan.ts) plans one card from statement date to statement date.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { displayAccountName, type AccountType } from "@/lib/account-type";
import { forecastGroups, type ForecastRow } from "@/lib/budget-forecast";
import { OTHER_GROUP } from "@/lib/envelope-defaults";
import { planTier, type GroupTier } from "@/lib/month-plan";
import { type MonthPlanView } from "./month-plan";

export type CardTier = "BILLS" | "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED";
export interface CardGroup { id: string; name: string; spentCents: number; budgetCents: number | null; projectedCents: number; sharePct: number }
export interface CardBill { lineItemId: string; name: string; dueOn: string; /** Charged, or the budget while pending. */ cents: number; budgetedCents: number; paid: boolean }
export interface CardSection { tier: CardTier; spentCents: number; budgetCents: number | null; projectedCents: number; groups: CardGroup[]; bills: CardBill[] }
export interface CardRow {
  key: string;
  name: string;
  kind: "card" | "promo" | "checking";
  spentCents: number;
  budgetCents: number;
  projectedCents: number;
  sections: CardSection[];
  /** A typical month on this account: the bills that land on it plus its share of usual spending. */
  typicalCents: number | null;
  /** The card-payment bill for this card, when there is one. */
  paymentLineCents: number | null;
  closesOn: string | null;
  dueOn: string | null;
  dueCents: number | null;
}
export interface Check { name: string; ok: boolean; detail: string }

export const CHECKING = "checking";
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const TIER_OF = (t: string): CardTier => (t === "ESSENTIAL" || t === "FLEXIBLE" ? t : t === "BILLS" ? "BILLS" : "UNPLANNED");

type Acct = { id: string; name: string; nickname: string | null; type: AccountType; promoEndsOn: Date | null; statementCloseDay: number | null; linkedAccountId: string | null };

/** Accounts, how each maps to a row, and where each bill lands. */
export async function context(today: string) {
  const accounts = (await prisma.bankAccount.findMany({
    where: { hidden: false, type: { in: ["CHECKING", "CREDIT_CARD"] } },
    select: { id: true, name: true, nickname: true, type: true, promoEndsOn: true, statementCloseDay: true, linkedAccountId: true },
  })) as Acct[];
  const keyOf = (accountId: string | null | undefined) => {
    const a = accounts.find((x) => x.id === accountId);
    return a && a.type === "CREDIT_CARD" ? a.id : CHECKING;
  };
  const items = (await prisma.lineItem.findMany({
    select: { id: true, kind: true, paysCardId: true, plannedAmount: true, chargedTo: { select: { bankAccount: { select: { id: true } } } }, paidFrom: { select: { bankAccount: { select: { id: true } } } } },
  })) as Array<{ id: string; kind: string; paysCardId: string | null; plannedAmount: { toString(): string }; chargedTo: { bankAccount: { id: string } | null } | null; paidFrom: { bankAccount: { id: string } | null } | null }>;
  const recent = (await prisma.actualEntry.findMany({
    where: { bankTransactionId: { not: null }, bankTransaction: { postedOn: { gte: new Date(Date.parse(`${today}T00:00:00Z`) - 200 * 86_400_000) } } },
    select: { lineItemId: true, bankTransaction: { select: { accountId: true, postedOn: true } } },
    orderBy: { bankTransaction: { postedOn: "desc" } },
  })) as Array<{ lineItemId: string; bankTransaction: { accountId: string; postedOn: Date } | null }>;
  const lastPaid = new Map<string, string>();
  for (const r of recent) if (r.bankTransaction && !lastPaid.has(r.lineItemId)) lastPaid.set(r.lineItemId, r.bankTransaction.accountId);
  const landing = new Map(items.map((i) => [i.id, keyOf(i.chargedTo?.bankAccount?.id ?? lastPaid.get(i.id) ?? i.paidFrom?.bankAccount?.id ?? null)]));
  return { accounts, keyOf, items, landing };
}

/** Each budget's share per row, from the twelve months before; budgets with no history follow the overall split. */
export function shares(usual: MonthPlanView["byAccount"]["usual"], keyOf: (id: string) => string) {
  const per = new Map<string, Map<string, number>>();
  const overall = new Map<string, number>();
  for (const [g, accts] of Object.entries(usual)) {
    if (g === "__bills") continue;
    const m = new Map<string, number>();
    for (const [a, c] of Object.entries(accts)) {
      if (c <= 0) continue;
      const k = keyOf(a);
      m.set(k, (m.get(k) ?? 0) + c);
      overall.set(k, (overall.get(k) ?? 0) + c);
    }
    per.set(g, m);
  }
  const norm = (m: Map<string, number>) => {
    const t = [...m.values()].reduce((s, v) => s + v, 0);
    return t > 0 ? new Map([...m].map(([k, v]) => [k, v / t])) : null;
  };
  const fallback = norm(overall) ?? new Map([[CHECKING, 1]]);
  return (groupId: string) => norm(per.get(groupId) ?? new Map()) ?? fallback;
}

/** Splits an amount across rows by share, so the parts add up exactly (the largest share takes the rounding). */
export function split(total: number, share: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let given = 0;
  const entries = [...share].sort((a, b) => b[1] - a[1]);
  entries.forEach(([k, s], i) => {
    if (i === 0) return;
    const v = Math.round(total * s);
    out.set(k, v);
    given += v;
  });
  if (entries.length) out.set(entries[0][0], total - given);
  return out;
}

function emptyRow(key: string, name: string, kind: CardRow["kind"]): CardRow {
  return {
    key, name, kind, spentCents: 0, budgetCents: 0, projectedCents: 0, typicalCents: null, paymentLineCents: null, closesOn: null, dueOn: null, dueCents: null,
    sections: (["BILLS", "ESSENTIAL", "FLEXIBLE", "UNPLANNED"] as CardTier[]).map((tier) => ({ tier, spentCents: 0, budgetCents: 0, projectedCents: 0, groups: [], bills: [] })),
  };
}

/**
 * The month split by card. [rows] are the Budget tab's forecast rows (so projections match the
 * page), [reserveCents] the unplanned reserve.
 */
export async function monthByCard(plan: MonthPlanView, rows: ForecastRow[], reserveCents: number): Promise<{ cards: CardRow[]; checks: Check[] }> {
  const ctx = await context(plan.today);
  const shareOf = shares(plan.byAccount.usual, ctx.keyOf);
  const [y, m] = [Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7))];
  const { listCardPayments } = await import("./card-payments");
  const cardStatus = new Map((await listCardPayments(plan.today).catch(() => [])).map((c) => [c.id, c]));

  const out = new Map<string, CardRow>();
  for (const a of ctx.accounts.filter((x) => x.type === "CREDIT_CARD")) {
    const r = emptyRow(a.id, a.nickname || displayAccountName(a.name), a.promoEndsOn && iso(a.promoEndsOn) >= plan.today ? "promo" : "card");
    const st = cardStatus.get(a.id);
    if (st) Object.assign(r, { closesOn: nextClose(st.lastClose), dueOn: st.nextDue, dueCents: st.dueCents });
    out.set(a.id, r);
  }
  out.set(CHECKING, emptyRow(CHECKING, "Checking", "checking"));
  const row = (k: string) => out.get(k) ?? out.get(CHECKING)!;
  const sec = (r: CardRow, t: CardTier) => r.sections.find((s) => s.tier === t)!;

  // Bills: each lands on one row; paid ones where they were actually charged.
  const paidAcct = (await prisma.actualEntry.findMany({
    where: { year: y, month: m, bankTransactionId: { not: null } },
    select: { lineItemId: true, bankTransaction: { select: { accountId: true } } },
  })) as Array<{ lineItemId: string; bankTransaction: { accountId: string } | null }>;
  const paidAt = new Map(paidAcct.map((p) => [p.lineItemId, ctx.keyOf(p.bankTransaction?.accountId)]));
  for (const b of plan.bills.items) {
    if (b.status === "skipped") continue;
    const k = b.status === "paid" && paidAt.has(b.lineItemId) ? paidAt.get(b.lineItemId)! : (ctx.landing.get(b.lineItemId) ?? CHECKING);
    const s = sec(row(k), "BILLS");
    s.budgetCents = (s.budgetCents ?? 0) + b.budgetedCents;
    s.projectedCents += b.cents;
    if (b.status === "paid") s.spentCents += b.cents;
    s.bills.push({ lineItemId: b.lineItemId, name: b.name, dueOn: b.dueOn, cents: b.cents, budgetedCents: b.budgetedCents, paid: b.status === "paid" });
  }
  for (const t of plan.bills.other) {
    const s = sec(row(ctx.keyOf(t.accountId)), "BILLS");
    s.budgetCents = (s.budgetCents ?? 0) + t.cents;
    s.projectedCents += t.cents;
    s.spentCents += t.cents;
  }
  // The debt payment: the 0% card's row (or checking when there's no such card).
  if (plan.debt.cents > 0) {
    const promo = [...out.values()].find((r) => r.kind === "promo");
    const s = sec(promo ?? out.get(CHECKING)!, "BILLS");
    const paid = plan.debt.source === "paid" ? plan.debt.cents : 0;
    s.budgetCents = (s.budgetCents ?? 0) + plan.debt.cents;
    s.projectedCents += plan.debt.cents;
    s.spentCents += paid;
    const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
    const extra = plan.debt.extraCents ? ` (incl. ${usd(plan.debt.extraCents)} extra income)` : "";
    s.bills.push({ lineItemId: "debt", name: `Debt payment${extra}`, dueOn: plan.debt.dueOn ?? `${plan.month}-28`, cents: plan.debt.cents, budgetedCents: plan.debt.cents, paid: paid > 0 });
  }

  // Budgets: exact spending per row, budget and the rest of the projection by share.
  const unplannedSpent = rows.filter((r) => r.tier === "UNPLANNED" || r.tier === "SORT").reduce((t, r) => t + r.spentCents, 0);
  for (const r of rows) {
    const tier = TIER_OF(r.tier === "SORT" ? "UNPLANNED" : r.tier);
    const share = shareOf(r.id);
    const spentBy = new Map<string, number>();
    for (const [a, c] of Object.entries(plan.byAccount.spent[r.id] ?? {})) spentBy.set(ctx.keyOf(a), (spentBy.get(ctx.keyOf(a)) ?? 0) + c);
    const budgetBy = r.limitCents === null ? null : split(r.limitCents, share);
    const restBy = split(Math.max(0, r.forecastCents - r.spentCents), share);
    const keys = new Set([...spentBy.keys(), ...(budgetBy ? [...budgetBy].filter(([, v]) => v).map(([k]) => k) : []), ...[...restBy].filter(([, v]) => v).map(([k]) => k)]);
    for (const k of keys) {
      const target = row(k);
      const s = sec(target, tier);
      const spent = spentBy.get(k) ?? 0;
      const budget = budgetBy ? (budgetBy.get(k) ?? 0) : null;
      const projected = spent + (restBy.get(k) ?? 0);
      s.spentCents += spent;
      if (budget !== null) s.budgetCents = (s.budgetCents ?? 0) + budget;
      s.projectedCents += projected;
      s.groups.push({ id: r.id, name: r.name, spentCents: spent, budgetCents: budget, projectedCents: projected, sharePct: Math.round((share.get(k) ?? 0) * 100) });
    }
  }
  // The unplanned reserve, whole, on the account unplanned spending usually lands on: it's one sum
  // for anything, so splitting it into small shares across cards only confuses.
  if (reserveCents > 0) {
    const s = sec(row(reserveHome(plan, shareOf) ?? CHECKING), "UNPLANNED");
    s.budgetCents = (s.budgetCents ?? 0) + reserveCents;
    // Until the reserve is used, it's still expected to be spent.
    s.projectedCents += Math.max(0, reserveCents - unplannedSpent);
  }

  // Totals, the typical month and the card-payment line.
  const paymentLines = ctx.items.filter((i) => i.kind === "SETTLEMENT" && i.paysCardId);
  // The lines as the Tracker shows them: set from each card's statement.
  const { cardPaymentLines } = await import("./statement-plan");
  const fromStatement = await cardPaymentLines(y, m).catch(() => new Map<string, number>());
  for (const r of out.values()) {
    for (const s of r.sections) {
      s.groups.sort((a, b) => b.spentCents - a.spentCents || (b.budgetCents ?? 0) - (a.budgetCents ?? 0));
      s.bills.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    }
    r.spentCents = r.sections.reduce((t, s) => t + s.spentCents, 0);
    r.budgetCents = r.sections.reduce((t, s) => t + (s.budgetCents ?? 0), 0);
    r.projectedCents = r.sections.reduce((t, s) => t + s.projectedCents, 0);
    if (r.kind === "card") {
      const usual = plan.groups.reduce((t, g) => t + Math.round(g.usualCents * (shareOf(g.id).get(r.key) ?? 0)), 0);
      r.typicalCents = usual + (sec(r, "BILLS").budgetCents ?? 0);
      const ledger = ctx.accounts.find((a) => a.id === r.key)?.linkedAccountId;
      const line = paymentLines.filter((i) => i.paysCardId === ledger).reduce((t, i) => t + (fromStatement.get(i.id) ?? toCents(i.plannedAmount)), 0);
      r.paymentLineCents = line || null;
    }
  }
  const cards = [...out.values()].filter((r) => r.kind === "checking" || r.spentCents || r.budgetCents || r.projectedCents);
  cards.sort((a, b) => (a.kind === "checking" ? 1 : 0) - (b.kind === "checking" ? 1 : 0) || (a.kind === "promo" ? 1 : 0) - (b.kind === "promo" ? 1 : 0) || b.projectedCents - a.projectedCents);
  return { cards, checks: await checksFor(plan, rows, cards, reserveCents, cardStatus) };
}

/** The checks shown under the page: the card rows add up, each card matches the bank, loose ends. */
async function checksFor(
  plan: MonthPlanView,
  rows: ForecastRow[],
  cards: CardRow[],
  reserveCents: number,
  status: Map<string, { name: string; statementCents: number; paidSinceCents: number; newChargesCents: number; owedNowCents: number }>,
): Promise<Check[]> {
  const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const checks: Check[] = [];
  const pageSpent = rows.reduce((t, r) => t + r.spentCents, 0) + plan.bills.listPaidCents + plan.bills.otherCents + (plan.debt.source === "paid" ? plan.debt.cents : 0);
  const cardSpent = cards.reduce((t, c) => t + c.spentCents, 0);
  const pageBudget = rows.filter((r) => r.limitCents !== null).reduce((t, r) => t + (r.limitCents ?? 0), 0) + plan.bills.listBudgetedCents + plan.bills.otherCents + plan.debt.cents + reserveCents;
  const cardBudget = cards.reduce((t, c) => t + c.budgetCents, 0);
  checks.push({
    name: "Card rows add up",
    ok: Math.abs(pageSpent - cardSpent) <= 1 && Math.abs(pageBudget - cardBudget) <= 1,
    detail: `Spent ${money(cardSpent)} of ${money(pageSpent)}, budget ${money(cardBudget)} of ${money(pageBudget)}`,
  });
  const balances = (await prisma.bankAccount.findMany({ where: { id: { in: [...status.keys()] } }, select: { id: true, balance: true } })) as Array<{ id: string; balance: { toString(): string } | null }>;
  for (const b of balances) {
    const s = status.get(b.id);
    if (!s || b.balance === null) continue;
    const owedBank = Math.max(0, -toCents(b.balance));
    const owedApp = s.statementCents - s.paidSinceCents + s.newChargesCents;
    checks.push({
      name: `${s.name} matches the bank`,
      ok: Math.abs(owedBank - owedApp) <= 100,
      detail: `Statement ${money(s.statementCents)} − paid ${money(s.paidSinceCents)} + new ${money(s.newChargesCents)} = ${money(owedApp)}; the bank says ${money(owedBank)}`,
    });
  }
  const unsorted = plan.groups.filter((g) => g.tier === "SORT").reduce((t, g) => t + g.categories.reduce((n, c) => n + c.transactions.length, 0), 0);
  checks.push({ name: "Everything has a budget", ok: unsorted === 0, detail: unsorted ? `${unsorted} charge${unsorted === 1 ? "" : "s"} still need a category or budget` : "No charges waiting" });
  if (plan.bills.other.length) checks.push({ name: "Bill charges matched", ok: false, detail: `${plan.bills.other.length} charge${plan.bills.other.length === 1 ? "" : "s"} in a bill category aren't on the bill list` });
  return checks;
}

/** The day after a statement date, a month on (the next statement date). */
export function nextClose(lastClose: string): string {
  const [y, m, d] = lastClose.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(d, last))));
}

/** The due date of the statement closing on [close]: the current due date's day, the month after the close. */
export function dueAfter(nextDue: string | null, close: string): string | null {
  if (!nextDue) return null;
  const day = Number(nextDue.slice(8, 10));
  const [y, m] = close.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(day, last))));
}

/** Cards that get a statement view: credit cards with a statement day, not on a 0% offer. */
export async function statementCards(today: string): Promise<Array<{ id: string; name: string }>> {
  const rows = (await prisma.bankAccount.findMany({
    where: { hidden: false, type: "CREDIT_CARD", statementCloseDay: { not: null } },
    select: { id: true, name: true, nickname: true, promoEndsOn: true },
  })) as Array<{ id: string; name: string; nickname: string | null; promoEndsOn: Date | null }>;
  return rows.filter((r) => !(r.promoEndsOn && iso(r.promoEndsOn) >= today)).map((r) => ({ id: r.id, name: r.nickname || displayAccountName(r.name) }));
}

/** The account unplanned spending usually lands on (weighted by each unplanned budget's usual month), or null. */
export function reserveHome(plan: MonthPlanView, shareOf: (id: string) => Map<string, number>): string | null {
  const weight = new Map<string, number>();
  for (const g of plan.groups.filter((x) => x.tier === "UNPLANNED")) {
    const usual = Math.max(1, g.usualCents ?? 0);
    for (const [k, v] of shareOf(g.id)) weight.set(k, (weight.get(k) ?? 0) + v * usual);
  }
  return [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
