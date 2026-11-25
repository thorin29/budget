/**
 * A card's statement, planned. A statement runs from one statement date to the next, so it holds
 * the end of one month and the start of the next. Its budget is made of those month portions:
 *
 *  - The end of a month that has started: what that month's budgets still have left once the
 *    spending before the portion (every account) is taken out, at this card's share. Pooled by
 *    section (Essentials, Extras) and never below zero.
 *  - The start of a month, or a month that hasn't started: the month's budgets by days.
 *  - The unplanned reserve, on the card unplanned spending usually lands on, by the same rule.
 *  - Bills that land on the card with a due date inside the statement.
 *
 * Budgets are the same every month (this month's), so a statement's budget never grows with
 * money carried over. The money check sets the statement against what checking can pay on its
 * due date once everything else due by then is paid.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { displayAccountName } from "@/lib/account-type";
import { forecastGroups } from "@/lib/budget-forecast";
import { OTHER_GROUP } from "@/lib/envelope-defaults";
import { planTier, type GroupTier } from "@/lib/month-plan";
import { isExtraIncome } from "@/lib/extra-income";
import { portionBudget } from "@/lib/statement-portion";
import { everydayParts, getMonthPlan, dueIso, billTypes, type BillItem, type CardRow as BillCardRow, type MonthPlanView, type Txn } from "./month-plan";
import { billCharge } from "./bill-merchants";
import { plannedPayments, paymentKey } from "./planned-payments";
import { getMonthView, type MonthEntry, type MonthView } from "./month";
import { CHECKING, TIER_OF, context, shares, nextClose, dueAfter, reserveHome, type CardBill, type CardSection, type CardTier } from "./card-view";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => Date.parse(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => iso(new Date(at(s) + n * DAY));
const daysBetween = (a: string, b: string) => Math.round((at(b) - at(a)) / DAY) + 1;
const monthStart = (ym: string) => `${ym}-01`;
const monthEnd = (ym: string) => iso(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)));
const addMonth = (s: string, by = 1) => {
  const d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1 + by, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(last, Number(s.slice(8, 10))))));
};

/** One month's part of a statement. */
export interface StatementPortion {
  from: string;
  to: string;
  /** "left": the month's budgets less what was spent before it. "days": the month's budgets by days. */
  rule: "left" | "days";
  billsCents: number;
  essentialCents: number;
  extrasCents: number;
  reserveCents: number;
  totalCents: number;
}

/**
 * The month the statement is due, as the Tracker sees it: that month's pay less the bills paid from
 * checking, the 0% payment and the other cards' statements due then. What's left is the most this
 * statement can be. Money already in checking isn't counted: it covers bills due before payday.
 */
export interface MoneyCheck {
  /** YYYY-MM, the month the statement is due. */
  month: string;
  payCents: number;
  billsCents: number;
  otherCardsCents: number;
  debtCents: number;
  ceilingCents: number;
  plannedCents: number;
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
  /** The statement's budget: its bills plus its month portions. */
  plannedCents: number;
  portions: StatementPortion[];
  money: MoneyCheck | null;
}

type Group = { id: string; name: string; tier: GroupTier; limitCents: number | null };

/** Everything the plans share: worked out once per request. */
export async function statementEnv(plan: MonthPlanView) {
  const ctx = await context(plan.today);
  const shareOf = shares(plan.byAccount.usual, ctx.keyOf);
  const [groups, categories, isBill, cardList] = await Promise.all([
    prisma.categoryGroup.findMany({ select: { id: true, name: true, tier: true, limitCents: true } }) as Promise<Group[]>,
    prisma.category.findMany({ select: { id: true, groupId: true } }) as Promise<Array<{ id: string; groupId: string | null }>>,
    billCharge(),
    prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD" }, select: { id: true, name: true, nickname: true, institution: true } }) as Promise<Array<{ id: string; name: string; nickname: string | null; institution: string | null }>>,
  ]);
  const { reserveSetting } = await import("./envelopes");
  const reserveCents = await reserveSetting();
  const cardNames = cardList.map((c) => ({ id: c.id, names: [c.nickname ?? "", c.name, c.institution ?? ""] }));
  const groupOf = new Map(categories.map((c) => [c.id, c.groupId]));
  const tierOf = new Map(groups.map((g) => [g.id, planTier(g.tier)]));
  const views = new Map<string, Promise<MonthView>>();
  const view = (ym: string) => {
    if (!views.has(ym)) views.set(ym, getMonthView(Number(ym.slice(0, 4)), Number(ym.slice(5, 7))));
    return views.get(ym)!;
  };

  /** Spending from [from] to [to] by budget, counted the way the month counts it; one account, or every one. */
  async function spending(from: string, to: string, accountId: string | null) {
    const txns = (await prisma.bankTransaction.findMany({
      where: {
        ...(accountId ? { accountId } : { account: { hidden: false } }),
        postedOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        kind: "NORMAL",
      },
      select: {
        id: true, accountId: true, postedOn: true, amount: true, merchant: true, description: true, categoryId: true, pending: true,
        category: { select: { name: true, managedForOthers: true } }, account: { select: { type: true } }, actual: { select: { id: true } }, splits: { select: { categoryId: true, amount: true, category: { select: { managedForOthers: true } } } },
      },
    })) as Txn[];
    const byGroup = new Map<string, number>();
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
        else byGroup.set(g, (byGroup.get(g) ?? 0) + p.cents);
        charged += p.cents;
      }
    }
    return { byGroup, billCharges, charged };
  }

  return { plan, ctx, shareOf, groups, tierOf, reserveCents, view, spending, home: reserveHome(plan, shareOf) };
}
export type Env = Awaited<ReturnType<typeof statementEnv>>;

/** Bills that land on [cardId] with a due date from [from] to [to] (charged before [from]: on the statement before). */
async function cycleBills(env: Env, cardId: string, from: string, to: string): Promise<CardBill[]> {
  const bills: CardBill[] = [];
  const seen = new Set<string>();
  for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = addMonth(`${ym}-01`).slice(0, 7)) {
    const v = await env.view(ym);
    for (const e of [...v.halves[0].entries, ...v.halves[1].entries]) {
      if (e.kind !== "BILL" || e.skipped || env.ctx.landing.get(e.lineItemId) !== cardId) continue;
      const due = dueIso(e.year, e.month, e.dueDay);
      if (due < from || due > to || seen.has(`${e.lineItemId}:${due}`)) continue;
      if (e.actualCents !== null && e.paidOn && e.paidOn < from) continue;
      seen.add(`${e.lineItemId}:${due}`);
      bills.push({ lineItemId: e.lineItemId, name: e.name, dueOn: due, cents: e.actualCents ?? e.budgetedCents, budgetedCents: e.budgetedCents, paid: e.actualCents !== null });
    }
  }
  return bills.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/** The statement's budget for [cardId] from [from] to [to]: bills, then each month's portion. */
export async function planCycle(env: Env, cardId: string, from: string, to: string) {
  const { plan, shareOf } = env;
  const bills = await cycleBills(env, cardId, from, to);
  const budgeted = plan.groups.filter((g) => (g.tier === "ESSENTIAL" || g.tier === "FLEXIBLE") && (g.limitCents ?? 0) > 0);
  const unplannedIds = new Set(plan.groups.filter((g) => g.tier === "UNPLANNED" || g.tier === "SORT").map((g) => g.id));
  const byGroup = new Map<string, number>();
  const portions: StatementPortion[] = [];
  let reserveTotal = 0;

  for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = addMonth(`${ym}-01`).slice(0, 7)) {
    const pFrom = from > monthStart(ym) ? from : monthStart(ym);
    const pTo = to < monthEnd(ym) ? to : monthEnd(ym);
    const rule: StatementPortion["rule"] = pTo === monthEnd(ym) && ym <= plan.month ? "left" : "days";
    const before = rule === "left" && pFrom > monthStart(ym) ? (await env.spending(monthStart(ym), addDays(pFrom, -1), null)).byGroup : new Map<string, number>();
    const fraction = daysBetween(pFrom, pTo) / daysBetween(monthStart(ym), monthEnd(ym));
    const r = portionBudget({
      rule,
      budgets: budgeted.map((g) => ({ id: g.id, tier: g.tier as "ESSENTIAL" | "FLEXIBLE", limitCents: g.limitCents ?? 0, share: shareOf(g.id).get(cardId) ?? 0 })),
      before,
      fraction,
      reserveCents: env.home === cardId ? env.reserveCents : 0,
      unplannedBeforeCents: [...before].filter(([g]) => unplannedIds.has(g)).reduce((t, [, c]) => t + c, 0),
    });
    for (const [k, v] of r.byGroup) byGroup.set(k, (byGroup.get(k) ?? 0) + v);
    const tierCents = { ESSENTIAL: r.essentialCents, FLEXIBLE: r.extrasCents };
    const reserve = r.reserveCents;
    reserveTotal += reserve;
    const billsCents = bills.filter((b) => b.dueOn >= pFrom && b.dueOn <= pTo).reduce((t, b) => t + b.budgetedCents, 0);
    portions.push({ from: pFrom, to: pTo, rule, billsCents, essentialCents: tierCents.ESSENTIAL, extrasCents: tierCents.FLEXIBLE, reserveCents: reserve, totalCents: billsCents + tierCents.ESSENTIAL + tierCents.FLEXIBLE + reserve });
  }
  const plannedCents = portions.reduce((t, p) => t + p.totalCents, 0);
  return { bills, byGroup, reserveCents: reserveTotal, portions, plannedCents };
}

/** The statement window that closes on [close]. */
export function windowClosing(close: string, closeDay: number): { from: string; to: string } {
  const prev = addMonth(close.slice(0, 7) + "-01", -1);
  const last = Number(monthEnd(prev.slice(0, 7)).slice(8, 10));
  const prevClose = `${prev.slice(0, 7)}-${String(Math.min(closeDay, last)).padStart(2, "0")}`;
  return { from: addDays(prevClose, 1), to: close };
}

type Status = { id: string; lastClose: string; statementCents: number; newChargesCents: number; promoEndsOn: string | null };

/**
 * The statement of card [st] due in [ym]: the one that closed the month before. Closed: its
 * amount. Still open or to come: its plan, or what's on it when that's more. Null for a statement
 * before the last one.
 */
export async function statementDueIn(env: Env, st: Status, closeDay: number, ym: string): Promise<number | null> {
  const closeYm = addMonth(`${ym}-01`, -1).slice(0, 7);
  const last = Number(monthEnd(closeYm).slice(8, 10));
  const close = `${closeYm}-${String(Math.min(closeDay, last)).padStart(2, "0")}`;
  if (close < st.lastClose) return null;
  // A payment set on the Payments page wins.
  const set = (await plannedPayments())[paymentKey.card(st.id, close)];
  if (set) return set.cents;
  if (close === st.lastClose) return st.statementCents;
  const w = windowClosing(close, closeDay);
  const planned = await planCycle(env, st.id, w.from, w.to);
  return Math.max(planned.plannedCents, w.from <= env.plan.today ? st.newChargesCents : 0);
}

export async function cardTerms(today: string) {
  const { listCardPayments } = await import("./card-payments");
  const statuses = (await listCardPayments(today).catch(() => [])).filter((s) => !(s.promoEndsOn && s.promoEndsOn >= today));
  const accounts = (await prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD", hidden: false }, select: { id: true, linkedAccountId: true, statementCloseDay: true } })) as Array<{ id: string; linkedAccountId: string | null; statementCloseDay: number | null }>;
  return statuses.flatMap((st) => {
    const a = accounts.find((x) => x.id === st.id);
    return a?.statementCloseDay ? [{ st, closeDay: a.statementCloseDay, ledgerId: a.linkedAccountId }] : [];
  });
}

/**
 * What the card-payment lines on the Tracker should be for [year]-[month]: each card's statement
 * due that month (see statementDueIn). Statements before the last one are left as they are.
 */
export async function cardPaymentLines(year: number, month: number): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const plan = await getMonthPlan();
  const terms = await cardTerms(plan.today);
  if (!terms.length) return out;
  const env = await statementEnv(plan);
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const lines = env.ctx.items.filter((i) => i.kind === "SETTLEMENT" && i.paysCardId);
  for (const t of terms) {
    const line = lines.filter((i) => i.paysCardId === t.ledgerId);
    if (line.length !== 1) continue;
    const cents = await statementDueIn(env, t.st, t.closeDay, ym);
    if (cents !== null) out.set(line[0].id, cents);
  }
  return out;
}

/** The money check for [cardId]'s statement due on [dueOn] (see MoneyCheck). */
export async function moneyCheck(env: Env, cardId: string, dueOn: string, plannedCents: number): Promise<MoneyCheck> {
  const { plan, ctx } = env;
  const ym = dueOn.slice(0, 7);
  const [y, m] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
  const v = await env.view(ym);
  const items = (await prisma.lineItem.findMany({
    select: { id: true, name: true, kind: true, paysCardId: true, paysCardLocked: true, paidFromSurplus: true, paydayNumber: true, scheduleKind: true, months: true, plannedAmount: true },
  })) as Array<BillItem & { paydayNumber: number | null; scheduleKind: string; months: number[]; plannedAmount: { toString(): string } }>;
  const cardRows = (await prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD", hidden: false }, select: { id: true, name: true, nickname: true, institution: true, promoEndsOn: true } })) as BillCardRow[];
  const { isCardPayment, isDebt } = billTypes(items, cardRows, plan.today);
  const { extraToDebtSetting } = await import("./envelopes");
  const { loadPaydays } = await import("./pay-split");
  const extraToDebt = await extraToDebtSetting();
  const frequency = (await loadPaydays()).frequency(y, m);
  const byId = new Map(items.map((i) => [i.id, i]));
  const amount = (e: MonthEntry) => e.actualCents ?? e.budgetedCents;

  // Extra pay (a third paycheck, a bonus) goes to the 0% card when that's the setting: not counted.
  const payCents = v.income
    .filter((e) => !e.skipped)
    .filter((e) => {
      const i = byId.get(e.lineItemId);
      return !(extraToDebt && i && isExtraIncome({ ...i, plannedCents: toCents(i.plannedAmount) }, frequency));
    })
    .reduce((t, e) => t + amount(e), 0);
  const billsCents = [...v.halves[0].entries, ...v.halves[1].entries]
    .filter((e) => e.kind === "BILL" && !e.skipped && !e.carriedFrom && !e.paidFromSurplus && !isCardPayment(e.lineItemId) && !isDebt(e.lineItemId))
    .filter((e) => (ctx.landing.get(e.lineItemId) ?? CHECKING) === CHECKING)
    .reduce((t, e) => t + amount(e), 0);
  const debtCents = Math.max(0, plan.debt.cents - plan.debt.extraCents);
  let otherCardsCents = 0;
  for (const t of await cardTerms(plan.today)) {
    if (t.st.id === cardId) continue;
    otherCardsCents += (await statementDueIn(env, t.st, t.closeDay, ym)) ?? 0;
  }
  const ceilingCents = payCents - billsCents - debtCents - otherCardsCents;
  return { month: ym, payCents, billsCents, otherCardsCents, debtCents, ceilingCents, plannedCents };
}

/**
 * One card from its last statement date to its next: its plan, what's been charged, the bills
 * still to land on it, and whether checking can pay it.
 */
export async function statementView(cardId: string): Promise<StatementView | null> {
  const plan = await getMonthPlan();
  const env = await statementEnv(plan);
  const card = env.ctx.accounts.find((a) => a.id === cardId && a.type === "CREDIT_CARD");
  if (!card) return null;
  const { listCardPayments } = await import("./card-payments");
  const st = (await listCardPayments(plan.today).catch(() => [])).find((c) => c.id === cardId);
  if (!st?.lastClose) return null;
  const from = addDays(st.lastClose, 1);
  const to = nextClose(st.lastClose);
  const days = daysBetween(from, to);
  const day = Math.min(days, Math.max(1, daysBetween(from, plan.today)));

  const [cycle, charges] = await Promise.all([planCycle(env, cardId, from, to), env.spending(from, to, cardId)]);
  const { bills, byGroup: planned, reserveCents, portions, plannedCents } = cycle;
  const toCome = bills.filter((b) => !b.paid).reduce((t, b) => t + b.cents, 0);

  const usualOf = new Map(plan.groups.map((g) => [g.id, g.usualCents]));
  const limitOf = new Map(plan.groups.map((g) => [g.id, g.limitCents]));
  const ids = new Set([...charges.byGroup.keys(), ...planned.keys()]);
  const forecast = forecastGroups(
    [...ids].map((id) => {
      const g = env.groups.find((x) => x.id === id);
      const share = env.shareOf(id).get(cardId) ?? 0;
      const tier = id === "uncategorized" || id === OTHER_GROUP.id ? "SORT" : (planTier(g?.tier ?? "UNPLANNED") as "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED");
      const hasLimit = limitOf.get(id) !== null && limitOf.get(id) !== undefined;
      return {
        id, name: g?.name ?? (id === "uncategorized" ? "Needs a category" : OTHER_GROUP.name), tier,
        spentCents: charges.byGroup.get(id) ?? 0, limitCents: hasLimit || planned.has(id) ? (planned.get(id) ?? 0) : null,
        usualCents: Math.round((usualOf.get(id) ?? 0) * share), charges: 2,
      };
    }),
    day, days, false,
  );
  const sections: CardSection[] = (["BILLS", "ESSENTIAL", "FLEXIBLE", "UNPLANNED"] as CardTier[]).map((tier) => {
    if (tier === "BILLS") {
      const budget = bills.reduce((t, b) => t + b.budgetedCents, 0);
      return { tier, spentCents: charges.billCharges, budgetCents: budget, projectedCents: charges.billCharges + toCome, groups: [], bills };
    }
    const list = forecast.filter((f) => TIER_OF(f.tier === "SORT" ? "UNPLANNED" : f.tier) === tier);
    const groupsOut = list.map((f) => ({ id: f.id, name: f.name, spentCents: f.spentCents, budgetCents: f.limitCents, projectedCents: f.forecastCents, sharePct: Math.round((env.shareOf(f.id).get(cardId) ?? 0) * 100) }));
    groupsOut.sort((a, b) => b.spentCents - a.spentCents || (b.budgetCents ?? 0) - (a.budgetCents ?? 0));
    const spentHere = groupsOut.reduce((t, g) => t + g.spentCents, 0);
    const reserveHere = tier === "UNPLANNED" ? reserveCents : 0;
    return {
      tier,
      spentCents: spentHere,
      budgetCents: tier !== "UNPLANNED" ? groupsOut.reduce((t, g) => t + (g.budgetCents ?? 0), 0) : reserveHere || null,
      projectedCents: groupsOut.reduce((t, g) => t + g.projectedCents, 0) + Math.max(0, reserveHere - spentHere),
      groups: groupsOut,
      bills: [],
    };
  });
  const room = Math.max(
    0,
    sections.filter((s) => s.tier === "ESSENTIAL" || s.tier === "FLEXIBLE").reduce((t, s) => t + s.groups.reduce((n, g) => n + Math.max(0, (g.budgetCents ?? 0) - g.spentCents), 0), 0) -
      sections.filter((s) => s.tier === "UNPLANNED").reduce((t, s) => t + Math.max(0, s.spentCents - (s.budgetCents ?? 0)), 0),
  );
  const totals = {
    spentCents: sections.reduce((t, s) => t + s.spentCents, 0),
    budgetCents: sections.reduce((t, s) => t + (s.budgetCents ?? 0), 0),
    projectedCents: sections.reduce((t, s) => t + s.projectedCents, 0),
  };
  const spendSections = sections.filter((x) => x.tier !== "BILLS");
  const spendBudget = spendSections.reduce((t, x) => t + (x.budgetCents ?? 0), 0);
  const dueOn = dueAfter(st.nextDue, to);
  return {
    budgetLeftCents: spendBudget - spendSections.reduce((t, x) => t + x.spentCents, 0),
    budgetLeftEndCents: spendBudget - spendSections.reduce((t, x) => t + x.projectedCents, 0),
    card: { id: card.id, name: card.nickname || displayAccountName(card.name) },
    from, to, dueOn,
    day, days, daysLeft: days - day,
    chargedCents: charges.charged, billsToComeCents: toCome, roomCents: room, projectedCents: totals.projectedCents, sections, totals,
    plannedCents,
    portions,
    money: dueOn ? await moneyCheck(env, cardId, dueOn, plannedCents).catch(() => null) : null,
  };
}
