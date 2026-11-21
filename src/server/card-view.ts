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
 *  - The statement view does the same for one card from its last statement date to its next.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { displayAccountName, type AccountType } from "@/lib/account-type";
import { forecastGroups, type ForecastRow } from "@/lib/budget-forecast";
import { OTHER_GROUP } from "@/lib/envelope-defaults";
import { planTier, type GroupTier } from "@/lib/month-plan";
import { everydayParts, getMonthPlan, dueIso, type MonthPlanView, type Txn } from "./month-plan";
import { billCharge } from "./bill-merchants";
import { getMonthView } from "./month";

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

const CHECKING = "checking";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const TIER_OF = (t: string): CardTier => (t === "ESSENTIAL" || t === "FLEXIBLE" ? t : t === "BILLS" ? "BILLS" : "UNPLANNED");

type Acct = { id: string; name: string; nickname: string | null; type: AccountType; promoEndsOn: Date | null; statementCloseDay: number | null; linkedAccountId: string | null };

/** Accounts, how each maps to a row, and where each bill lands. */
async function context(today: string) {
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
function shares(usual: MonthPlanView["byAccount"]["usual"], keyOf: (id: string) => string) {
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
function split(total: number, share: Map<string, number>): Map<string, number> {
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
  // The unplanned reserve, split the way unplanned spending usually goes.
  if (reserveCents > 0) {
    const unplannedIds = rows.filter((r) => r.tier === "UNPLANNED").map((r) => r.id);
    const mix = new Map<string, number>();
    for (const id of unplannedIds) for (const [k, v] of shareOf(id)) mix.set(k, (mix.get(k) ?? 0) + v);
    const total = [...mix.values()].reduce((s, v) => s + v, 0);
    const by = split(reserveCents, total > 0 ? new Map([...mix].map(([k, v]) => [k, v / total])) : new Map([[CHECKING, 1]]));
    for (const [k, v] of by) {
      const s = sec(row(k), "UNPLANNED");
      s.budgetCents = (s.budgetCents ?? 0) + v;
      // Until the reserve is used, it's still expected to be spent.
      s.projectedCents += Math.max(0, Math.round(Math.max(0, reserveCents - unplannedSpent) * (v / reserveCents)));
    }
  }

  // Totals, the typical month and the card-payment line.
  const paymentLines = ctx.items.filter((i) => i.kind === "SETTLEMENT" && i.paysCardId);
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
      const line = paymentLines.filter((i) => i.paysCardId === ledger).reduce((t, i) => t + toCents(i.plannedAmount), 0);
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
function nextClose(lastClose: string): string {
  const [y, m, d] = lastClose.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(d, last))));
}

export interface StatementView {
  card: { id: string; name: string };
  /** YYYY-MM-DD, the first and last day of the statement. */
  from: string;
  to: string;
  dueOn: string | null;
  day: number;
  days: number;
  daysLeft: number;
  chargedCents: number;
  billsToComeCents: number;
  roomCents: number;
  projectedCents: number;
  sections: CardSection[];
  totals: { spentCents: number; budgetCents: number; projectedCents: number };
  /** The card's budgets (Essentials, Extras, the reserve) less spending (unplanned too): today, and at the projection. */
  budgetLeftCents: number;
  budgetLeftEndCents: number;
}

/**
 * One card from its last statement date to its next: what's been charged, the bills still to land
 * on it, and the month's budgets (its share of them) counted from the statement date.
 */
export async function statementView(cardId: string): Promise<StatementView | null> {
  const plan = await getMonthPlan();
  const ctx = await context(plan.today);
  const card = ctx.accounts.find((a) => a.id === cardId && a.type === "CREDIT_CARD");
  if (!card) return null;
  const { listCardPayments } = await import("./card-payments");
  const st = (await listCardPayments(plan.today).catch(() => [])).find((c) => c.id === cardId);
  if (!st?.lastClose) return null;
  const from = iso(new Date(Date.parse(`${st.lastClose}T00:00:00Z`) + 86_400_000));
  const to = nextClose(st.lastClose);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const day = Math.min(days, Math.max(1, Math.round((Date.parse(`${plan.today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1));
  const shareOf = shares(plan.byAccount.usual, ctx.keyOf);

  // Charges on the card since the statement date, by budget, counted the same way as the month.
  const [groups, categories, isBill] = await Promise.all([
    prisma.categoryGroup.findMany({ select: { id: true, name: true, tier: true, limitCents: true } }) as Promise<Array<{ id: string; name: string; tier: GroupTier; limitCents: number | null }>>,
    prisma.category.findMany({ select: { id: true, groupId: true } }) as Promise<Array<{ id: string; groupId: string | null }>>,
    billCharge(),
  ]);
  const txns = (await prisma.bankTransaction.findMany({
    where: { accountId: cardId, postedOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }, kind: "NORMAL" },
    select: {
      id: true, accountId: true, postedOn: true, amount: true, merchant: true, description: true, categoryId: true, pending: true,
      category: { select: { name: true, managedForOthers: true } }, account: { select: { type: true } }, actual: { select: { id: true } }, splits: { select: { categoryId: true, amount: true } },
    },
  })) as Txn[];
  const cards = await prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD" }, select: { id: true, name: true, nickname: true, institution: true } }) as Array<{ id: string; name: string; nickname: string | null; institution: string | null }>;
  const cardNames = cards.map((c) => ({ id: c.id, names: [c.nickname ?? "", c.name, c.institution ?? ""] }));
  const groupOf = new Map(categories.map((c) => [c.id, c.groupId]));
  const tierOf = new Map(groups.map((g) => [g.id, planTier(g.tier)]));
  const spentBy = new Map<string, number>();
  let billCharges = 0;
  let charged = 0;
  for (const t of txns) {
    const cents = toCents(t.amount);
    if (isBill(t) && cents < 0) {
      billCharges += -cents;
      charged += -cents;
      continue;
    }
    const parts = everydayParts(t, isBill, cardNames);
    if (!parts) continue;
    for (const p of parts) {
      const g = p.categoryId ? (groupOf.get(p.categoryId) ?? OTHER_GROUP.id) : "uncategorized";
      if (tierOf.get(g) === "BILLS") billCharges += p.cents;
      else spentBy.set(g, (spentBy.get(g) ?? 0) + p.cents);
      charged += p.cents;
    }
  }

  // Bills that land on this card with a due date in the statement, from the months it spans.
  const bills: CardBill[] = [];
  const months = new Set([from.slice(0, 7), to.slice(0, 7)]);
  for (const ym of months) {
    const v = await getMonthView(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
    for (const e of [...v.halves[0].entries, ...v.halves[1].entries]) {
      if (e.kind === "INCOME" || e.skipped || ctx.landing.get(e.lineItemId) !== cardId) continue;
      const due = dueIso(e.year, e.month, e.dueDay);
      if (due < from || due > to) continue;
      // Charged before the statement began: it was on the last statement.
      if (e.actualCents !== null && e.paidOn && e.paidOn < from) continue;
      bills.push({ lineItemId: e.lineItemId, name: e.name, dueOn: due, cents: e.actualCents ?? e.budgetedCents, budgetedCents: e.budgetedCents, paid: e.actualCents !== null });
    }
  }
  bills.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const toCome = bills.filter((b) => !b.paid).reduce((t, b) => t + b.cents, 0);

  const { reserveSetting } = await import("./envelopes");
  const reserveCents = await reserveSetting();
  const unplannedIds = plan.groups.filter((g) => g.tier === "UNPLANNED").map((g) => g.id);
  const unplannedUsual = unplannedIds.reduce((t, id) => t + (usualOfId(id) ?? 0), 0);
  const unplannedShare = unplannedUsual > 0 ? unplannedIds.reduce((t, id) => t + (usualOfId(id) ?? 0) * (shareOf(id).get(cardId) ?? 0), 0) / unplannedUsual : 0;
  function usualOfId(id: string) {
    return plan.groups.find((g) => g.id === id)?.usualCents;
  }
  // Budgets: this month's limits, this card's share; projected at the pace so far, as the month does.
  const limitOf = new Map(plan.groups.map((g) => [g.id, g.limitCents]));
  const usualOf = new Map(plan.groups.map((g) => [g.id, g.usualCents]));
  const ids = new Set([...spentBy.keys(), ...plan.groups.filter((g) => (shareOf(g.id).get(cardId) ?? 0) > 0 && (g.limitCents ?? 0) > 0).map((g) => g.id)]);
  const forecast = forecastGroups(
    [...ids].map((id) => {
      const g = groups.find((x) => x.id === id);
      const share = shareOf(id).get(cardId) ?? 0;
      const tier = id === "uncategorized" || id === OTHER_GROUP.id ? "SORT" : (planTier(g?.tier ?? "UNPLANNED") as "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED");
      const limit = limitOf.get(id);
      return {
        id, name: g?.name ?? (id === "uncategorized" ? "Needs a category" : OTHER_GROUP.name), tier,
        spentCents: spentBy.get(id) ?? 0, limitCents: limit === null || limit === undefined ? null : Math.round(limit * share),
        usualCents: Math.round((usualOf.get(id) ?? 0) * share), charges: 2,
      };
    }),
    day, days, false,
  );
  const sections: CardSection[] = (["BILLS", "ESSENTIAL", "FLEXIBLE", "UNPLANNED"] as CardTier[]).map((tier) => {
    if (tier === "BILLS") {
      const budget = bills.reduce((t, b) => t + b.budgetedCents, 0);
      return { tier, spentCents: billCharges, budgetCents: budget, projectedCents: billCharges + toCome, groups: [], bills };
    }
    const list = forecast.filter((f) => TIER_OF(f.tier === "SORT" ? "UNPLANNED" : f.tier) === tier);
    const groupsOut = list.map((f) => ({ id: f.id, name: f.name, spentCents: f.spentCents, budgetCents: f.limitCents, projectedCents: f.forecastCents, sharePct: Math.round((shareOf(f.id).get(cardId) ?? 0) * 100) }));
    groupsOut.sort((a, b) => b.spentCents - a.spentCents || (b.budgetCents ?? 0) - (a.budgetCents ?? 0));
    const budgeted = tier !== "UNPLANNED";
    const spentHere = groupsOut.reduce((t, g) => t + g.spentCents, 0);
    // The unplanned reserve: this card's usual share of it, expected until it's used.
    const reserveHere = tier === "UNPLANNED" ? Math.round(reserveCents * unplannedShare) : 0;
    return {
      tier,
      spentCents: spentHere,
      budgetCents: budgeted ? groupsOut.reduce((t, g) => t + (g.budgetCents ?? 0), 0) : reserveHere || null,
      projectedCents: groupsOut.reduce((t, g) => t + g.projectedCents, 0) + Math.max(0, reserveHere - spentHere),
      groups: groupsOut,
      bills: [],
    };
  });
  const room = Math.max(
    0,
    sections.filter((s) => s.tier === "ESSENTIAL" || s.tier === "FLEXIBLE").reduce((t, s) => t + s.groups.reduce((n, g) => n + Math.max(0, (g.budgetCents ?? 0) - g.spentCents), 0), 0) -
      // Unplanned spending past this card's share of the reserve comes out of the room.
      sections.filter((s) => s.tier === "UNPLANNED").reduce((t, s) => t + Math.max(0, s.spentCents - (s.budgetCents ?? 0)), 0),
  );
  const totals = {
    spentCents: sections.reduce((t, s) => t + s.spentCents, 0),
    budgetCents: sections.reduce((t, s) => t + (s.budgetCents ?? 0), 0),
    projectedCents: sections.reduce((t, s) => t + s.projectedCents, 0),
  };
  const spendSections = sections.filter((x) => x.tier !== "BILLS");
  const spendBudget = spendSections.reduce((t, x) => t + (x.budgetCents ?? 0), 0);
  const budgetLeftCents = spendBudget - spendSections.reduce((t, x) => t + x.spentCents, 0);
  const budgetLeftEndCents = spendBudget - spendSections.reduce((t, x) => t + x.projectedCents, 0);
  return {
    budgetLeftCents,
    budgetLeftEndCents,
    card: { id: card.id, name: card.nickname || displayAccountName(card.name) },
    from, to, dueOn: dueAfter(st.nextDue, to),
    day, days, daysLeft: days - day,
    chargedCents: charged, billsToComeCents: toCome, roomCents: room, projectedCents: totals.projectedCents, sections, totals,
  };
}

/** The due date of the statement closing on [close]: the current due date's day, the month after the close. */
function dueAfter(nextDue: string | null, close: string): string | null {
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
