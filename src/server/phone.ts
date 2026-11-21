/**
 * What the phone app shows, worked out here so the phone and the web never disagree: Today, the
 * Budget views (the month, each card's statement, by card), the Insights overview, and the alerts
 * the phone turns into notifications. The phone only draws these.
 */

import { getMonthPlan, type MonthPlanView } from "./month-plan";
import { planForecastRows, budgetLeftOf } from "./plan-charts";
import { forecastTotals, type ForecastRow } from "@/lib/budget-forecast";
import { reserveSetting, cushionSetting } from "./envelopes";
import { monthByCard, type CardRow, type CardSection } from "./card-view";
import { statementView, type StatementView } from "./statement-plan";
import { getCashTiming } from "./cash-timing";
import { getOutlook, type OutlookView } from "./outlook";
import { getReview } from "./review";
import { needsCategory } from "./needs-category";
import { listCardPayments } from "./card-payments";
import { getDebt } from "./debt";
import { recentAutomation } from "./bills-auto";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";

export type PhoneTier = "BILLS" | "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED" | "SORT";

export interface PhoneSection {
  tier: PhoneTier;
  name: string;
  spentCents: number;
  budgetCents: number | null;
  projectedCents: number;
  groups: Array<{ id: string; name: string; spentCents: number; budgetCents: number | null; projectedCents: number }>;
  bills: Array<{ name: string; dueOn: string; cents: number; budgetedCents: number; status: string }>;
}

export interface PhoneBudget {
  views: Array<{ key: string; name: string }>;
  view: string;
  period: { from: string; to: string; day: number; days: number };
  /** Budget left today and at the projection, unplanned spending included. */
  leftCents: number;
  leftEndCents: number;
  perDayCents: number | null;
  sections: PhoneSection[];
  /** "By card" only: each card and checking. */
  cards: Array<{ key: string; name: string; spentCents: number; budgetCents: number; projectedCents: number }>;
  checksOk: boolean;
}

const NAMES: Record<PhoneTier, string> = { BILLS: "Bills", ESSENTIAL: "Essentials", FLEXIBLE: "Extras", UNPLANNED: "Unplanned", SORT: "Needs sorting" };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

/** The cards worth a statement view: a typical month over $100, with statement days set. */
function statementCards(cards: CardRow[]) {
  return cards.filter((c) => c.kind === "card" && c.closesOn && (c.typicalCents ?? 0) >= 10_000).sort((a, b) => (b.typicalCents ?? 0) - (a.typicalCents ?? 0));
}

async function monthParts(plan: MonthPlanView) {
  const reserve = await reserveSetting();
  const rows = planForecastRows(plan);
  const split = await monthByCard(plan, rows, reserve).catch(() => ({ cards: [] as CardRow[], checks: [] as Array<{ ok: boolean }> }));
  return { reserve, rows, split };
}

function monthSections(plan: MonthPlanView, rows: ForecastRow[], reserve: number): PhoneSection[] {
  const debtPaid = plan.debt.source === "paid" ? plan.debt.cents : 0;
  const bills: PhoneSection = {
    tier: "BILLS",
    name: plan.debt.cents ? "Bills & debt" : "Bills",
    spentCents: plan.bills.listPaidCents + plan.bills.otherCents + debtPaid,
    budgetCents: plan.bills.listBudgetedCents + plan.bills.otherCents + plan.debt.cents,
    projectedCents: plan.bills.listCents + plan.bills.otherCents + plan.debt.cents,
    groups: [],
    bills: [
      ...plan.bills.items.filter((b) => b.status !== "skipped").map((b) => ({ name: b.name, dueOn: b.dueOn, cents: b.cents, budgetedCents: b.budgetedCents, status: b.status })),
      ...(plan.debt.cents ? [{ name: "Debt payment", dueOn: plan.debt.dueOn ?? `${plan.month}-28`, cents: plan.debt.cents, budgetedCents: plan.debt.cents, status: debtPaid ? "paid" : "due" }] : []),
    ],
  };
  const tier = (t: PhoneTier, list: ForecastRow[], budget: number | null, extraProjected = 0): PhoneSection => ({
    tier: t,
    name: NAMES[t],
    spentCents: list.reduce((s, r) => s + r.spentCents, 0),
    budgetCents: budget,
    projectedCents: list.reduce((s, r) => s + r.forecastCents, 0) + extraProjected,
    groups: list.filter((r) => r.spentCents || r.limitCents).map((r) => ({ id: r.id, name: r.name, spentCents: r.spentCents, budgetCents: r.limitCents, projectedCents: r.forecastCents })),
    bills: [],
  });
  const ess = rows.filter((r) => r.tier === "ESSENTIAL");
  const ext = rows.filter((r) => r.tier === "FLEXIBLE");
  const unp = rows.filter((r) => r.tier === "UNPLANNED");
  const sort = rows.filter((r) => r.tier === "SORT" && r.spentCents);
  const unpSpent = unp.reduce((s, r) => s + r.spentCents, 0);
  const out = [
    bills,
    tier("ESSENTIAL", ess, ess.reduce((s, r) => s + (r.limitCents ?? 0), 0)),
    tier("FLEXIBLE", ext, ext.reduce((s, r) => s + (r.limitCents ?? 0), 0)),
    tier("UNPLANNED", unp, reserve || null, plan.closed ? 0 : Math.max(0, reserve - unpSpent)),
  ];
  if (sort.length) out.push(tier("SORT", sort, null));
  return out;
}

function statementSections(v: StatementView): PhoneSection[] {
  return v.sections
    .filter((s: CardSection) => s.spentCents || s.budgetCents || s.projectedCents)
    .map((s) => ({
      tier: s.tier,
      name: NAMES[s.tier],
      spentCents: s.spentCents,
      budgetCents: s.budgetCents,
      projectedCents: s.projectedCents,
      groups: s.groups.filter((g) => g.spentCents || g.budgetCents || g.projectedCents).map((g) => ({ id: g.id, name: g.name, spentCents: g.spentCents, budgetCents: g.budgetCents, projectedCents: g.projectedCents })),
      bills: s.bills.map((b) => ({ name: b.name, dueOn: b.dueOn, cents: b.cents, budgetedCents: b.budgetedCents, status: b.paid ? "paid" : "pending" })),
    }));
}

/** The Budget tab: [view] is "month", "cards" or a card's id (its statement). */
export async function phoneBudget(view = "month", year?: number, month?: number): Promise<PhoneBudget> {
  const plan = await getMonthPlan(year, month);
  const { reserve, rows, split } = await monthParts(plan);
  const current = !plan.closed && plan.month === plan.today.slice(0, 7);
  const stmts = current ? statementCards(split.cards) : [];
  const views = [{ key: "month", name: "Month" }, ...stmts.map((c) => ({ key: c.key, name: c.name })), ...(split.cards.length ? [{ key: "cards", name: "By card" }] : [])];
  const checksOk = split.checks.every((c) => c.ok);
  const [y, m] = [Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7))];
  const monthPeriod = { from: `${plan.month}-01`, to: iso(new Date(Date.UTC(y, m, 0))), day: plan.closed ? plan.daysInMonth : Number(plan.today.slice(8, 10)), days: plan.daysInMonth };

  if (stmts.some((c) => c.key === view)) {
    const v = await statementView(view);
    if (v) {
      return {
        views, view, checksOk, cards: [],
        period: { from: v.from, to: v.to, day: v.day, days: v.days },
        leftCents: v.budgetLeftCents,
        leftEndCents: v.budgetLeftEndCents,
        perDayCents: v.daysLeft > 0 ? Math.round(Math.max(0, v.budgetLeftCents) / v.daysLeft) : null,
        sections: statementSections(v),
      };
    }
  }
  const base = forecastTotals(rows);
  const unplannedLeft = plan.closed ? 0 : Math.max(0, reserve - base.unplannedCents);
  const budget = base.budgetCents + reserve;
  const left = budget - base.spentCents;
  const leftEnd = budget - (base.forecastCents + unplannedLeft);
  return {
    views, checksOk,
    view: view === "cards" && split.cards.length ? "cards" : "month",
    period: monthPeriod,
    leftCents: left,
    leftEndCents: leftEnd,
    perDayCents: plan.daysLeft > 0 ? Math.round(Math.max(0, left) / plan.daysLeft) : null,
    sections: view === "cards" ? [] : monthSections(plan, rows, reserve),
    cards: view === "cards" ? split.cards.map((c) => ({ key: c.key, name: c.name, spentCents: c.spentCents, budgetCents: c.budgetCents, projectedCents: c.projectedCents })) : [],
  };
}

// ---------------------------------------------------------------- Today

export interface PhoneToday {
  today: string;
  /** The main card's statement budget left, the headline; the month's when no card has a statement. */
  available: { cents: number; endCents: number; until: string; perDayCents: number | null; basis: "statement" | "month"; cardId: string | null; cardName: string | null };
  checking: { cents: number; payComingCents: number; nextPayOn: string | null; nextPayCents: number | null } | null;
  monthLeftCents: number;
  monthDaysLeft: number;
  statement: { cardId: string; name: string; from: string; to: string; day: number; days: number; chargedCents: number; billsToComeCents: number; projectedCents: number; dueOn: string | null } | null;
  needsYou: Array<{ kind: "pending" | "overdue" | "review" | "over" | "short"; text: string; cents: number | null; target: "tracker" | "review" | "budget" | "insights" }>;
  nextBills: Array<{ lineItemId: string; name: string; dueOn: string; cents: number; status: string }>;
  bankAsOf: string | null;
}

export async function phoneToday(): Promise<PhoneToday> {
  const plan = await getMonthPlan();
  const { reserve, rows, split } = await monthParts(plan);
  const main = statementCards(split.cards)[0];
  const [v, cash, review, uncategorized, conn] = await Promise.all([
    main ? statementView(main.key).catch(() => null) : null,
    getCashTiming(plan.debt.cents).catch(() => null),
    getReview().catch(() => null),
    needsCategory().catch(() => []),
    prisma.bankConnection.findUnique({ where: { id: "default" }, select: { lastSuccessAt: true } }).catch(() => null) as Promise<{ lastSuccessAt: Date | null } | null>,
  ]);
  const outlook = cash ? await getOutlook(cash.today, plan.debt.cents).catch(() => null) : null;
  const base = forecastTotals(rows);
  const unplannedLeft = Math.max(0, reserve - base.unplannedCents);
  const monthLeft = base.budgetCents + reserve - base.spentCents;
  const monthLeftEnd = base.budgetCents + reserve - base.forecastCents - unplannedLeft;
  const [y, m] = [Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7))];
  const monthEnd = iso(new Date(Date.UTC(y, m, 0)));

  const available: PhoneToday["available"] = v
    ? { cents: v.budgetLeftCents, endCents: v.budgetLeftEndCents, until: v.to, perDayCents: v.daysLeft > 0 ? Math.round(Math.max(0, v.budgetLeftCents) / v.daysLeft) : null, basis: "statement", cardId: v.card.id, cardName: v.card.name }
    : { cents: monthLeft, endCents: monthLeftEnd, until: monthEnd, perDayCents: plan.daysLeft > 0 ? Math.round(Math.max(0, monthLeft) / plan.daysLeft) : null, basis: "month", cardId: null, cardName: null };

  const thisMonthPay = plan.income.items.filter((i) => !i.received && i.dueOn >= plan.today).sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
  const nextPay = thisMonthPay ? { on: thisMonthPay.dueOn, cents: thisMonthPay.cents } : outlook?.pay[0] ? { on: outlook.pay[0].date, cents: outlook.pay[0].cents } : null;
  const checking = cash?.check
    ? { cents: cash.check.checkingCents, payComingCents: cash.check.incomeCents, nextPayOn: nextPay?.on ?? null, nextPayCents: nextPay?.cents ?? null }
    : null;

  const needsYou: PhoneToday["needsYou"] = [];
  for (const b of plan.bills.items.filter((x) => x.status === "pending")) needsYou.push({ kind: "pending", text: `${b.name} payment at the bank`, cents: b.cents, target: "tracker" });
  for (const b of plan.bills.items.filter((x) => x.status === "overdue")) needsYou.push({ kind: "overdue", text: `${b.name} is overdue`, cents: b.cents, target: "tracker" });
  const toReview = (review?.count ?? 0) + uncategorized.length;
  if (toReview) needsYou.push({ kind: "review", text: `${toReview} ${toReview === 1 ? "item" : "items"} to review`, cents: null, target: "review" });
  for (const g of plan.groups.filter((x) => x.overCents > 0 && x.tier !== "SORT")) needsYou.push({ kind: "over", text: `${g.name}, past its budget`, cents: g.overCents, target: "budget" });
  if (cash && !cash.missing && cash.shortOn) needsYou.push({ kind: "short", text: `Checking runs short on ${cash.shortOn}`, cents: cash.lowCents, target: "insights" });

  const nextBills = plan.bills.items
    .filter((b) => b.status !== "paid" && b.status !== "skipped")
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .slice(0, 4)
    .map((b) => ({ lineItemId: b.lineItemId, name: b.name, dueOn: b.dueOn, cents: b.cents, status: b.status }));

  return {
    today: plan.today,
    available,
    checking,
    monthLeftCents: monthLeft,
    monthDaysLeft: plan.daysLeft,
    statement: v ? { cardId: v.card.id, name: v.card.name, from: v.from, to: v.to, day: v.day, days: v.days, chargedCents: v.chargedCents, billsToComeCents: v.billsToComeCents, projectedCents: v.projectedCents, dueOn: v.dueOn } : null,
    needsYou,
    nextBills,
    bankAsOf: conn?.lastSuccessAt ? conn.lastSuccessAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------- Insights overview

export interface PhoneOverview {
  month: string;
  income: { totalCents: number; receivedCents: number };
  parts: Array<{ key: string; name: string; spentCents: number; budgetCents: number | null; dueCents: number }>;
  leftCents: number;
  /** Spent or paid past income (red). */
  overCents: number;
  /** How far past income the month may go once bills still due and the budgets left are used. */
  expectedOverCents: number;
  outlook: null | {
    from: string;
    to: string;
    paydayOn: string | null;
    worst: { beforeCents: number | null; afterCents: number };
    best: { beforeCents: number | null; afterCents: number };
  };
  lastMonth: { month: string; resultCents: number } | null;
  debtCents: number | null;
}

function outlookFor(o: OutlookView, start: number) {
  const sum = (ls: Array<{ cents: number }>) => ls.reduce((s, l) => s + l.cents, 0);
  const pay = o.payday?.date ?? null;
  const all = start + sum(o.pay) - sum(o.bills) - sum(o.debt);
  if (!pay) return { beforeCents: null, afterCents: all };
  const early = <T extends { date: string }>(ls: T[]) => ls.filter((l) => l.date < pay);
  return { beforeCents: start + sum(early(o.pay)) - sum(early(o.bills)) - sum(early(o.debt)), afterCents: all };
}

export async function phoneOverview(year?: number, month?: number): Promise<PhoneOverview> {
  const plan = await getMonthPlan(year, month);
  const [y, m] = [Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7))];
  const prev = m === 1 ? [y - 1, 12] : [y, m - 1];
  const current = !plan.closed && plan.month === plan.today.slice(0, 7);
  const [last, debt, cash] = await Promise.all([
    getMonthPlan(prev[0], prev[1]).catch(() => null),
    getDebt(plan.debt.cents).catch(() => null),
    current ? getCashTiming(plan.debt.cents).catch(() => null) : null,
  ]);
  const by = (t: string) => plan.groups.filter((g) => g.tier === t).reduce((s, g) => s + g.spentCents, 0);
  const limit = (t: string) => plan.groups.filter((g) => g.tier === t && g.limitCents !== null).reduce((s, g) => s + (g.limitCents ?? 0), 0);
  const debtPaid = plan.debt.source === "paid" ? plan.debt.cents : 0;
  const parts = [
    { key: "ess", name: "Essentials", spentCents: by("ESSENTIAL"), budgetCents: limit("ESSENTIAL"), dueCents: 0 },
    { key: "ext", name: "Extras", spentCents: by("FLEXIBLE"), budgetCents: limit("FLEXIBLE"), dueCents: 0 },
    { key: "unp", name: "Unplanned", spentCents: by("UNPLANNED") + by("SORT"), budgetCents: null, dueCents: 0 },
    { key: "bills", name: "Bills", spentCents: plan.bills.listPaidCents + plan.bills.otherCents, budgetCents: plan.bills.listCents + plan.bills.otherCents, dueCents: Math.max(0, plan.bills.listCents - plan.bills.listPaidCents) },
    ...(plan.debt.cents ? [{ key: "debt", name: "Debt", spentCents: debtPaid, budgetCents: plan.debt.cents, dueCents: plan.debt.cents - debtPaid }] : []),
  ];
  const income = Math.max(0, plan.income.totalCents);
  const actual = parts.reduce((s, p) => s + p.spentCents, 0);
  const out = actual + parts.reduce((s, p) => s + p.dueCents, 0);
  const overCents = Math.max(0, actual - income);
  const budgetLeft = budgetLeftOf(plan);
  const expectedOverCents = plan.closed ? overCents : Math.max(overCents, out + budgetLeft - income);

  let outlook: PhoneOverview["outlook"] = null;
  if (current && cash?.check) {
    const o = await getOutlook(cash.today, plan.debt.cents).catch(() => null);
    if (o) {
      const c = cash.check;
      const debtDue = plan.debt.source === "paid" ? 0 : plan.debt.cents;
      const now = c.checkingCents + c.incomeCents - c.cardsCents - c.billsCents - debtDue;
      outlook = { from: o.from, to: o.to, paydayOn: o.payday?.date ?? null, worst: outlookFor(o, now - budgetLeft), best: outlookFor(o, now) };
    }
  }
  return {
    month: plan.month,
    income: { totalCents: income, receivedCents: Math.max(0, plan.income.receivedCents) },
    parts,
    leftCents: income - out,
    overCents,
    expectedOverCents,
    outlook,
    lastMonth: last ? { month: last.month, resultCents: last.poolLeftCents } : null,
    debtCents: debt ? debt.totalCents : null,
  };
}

// ---------------------------------------------------------------- alerts

export type AlertKind =
  | "billDue" | "billOverdue" | "billAuto"
  | "cardDue" | "statementClosed"
  | "payday" | "short" | "largeCharge"
  | "budgetOver" | "reserveUsed" | "weekly"
  | "review" | "syncStopped" | "amazonSync";

export interface PhoneAlert {
  /** Stable: the phone posts each key once. */
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** Where tapping it opens. */
  open: "today" | "tracker" | "cards" | "insights" | "budget" | "review" | "transactions";
  /** For large charges: the amount, so the phone can apply its own threshold. */
  cents?: number;
}

const whole = (c: number) => `${c < 0 ? "−" : ""}$${Math.abs(Math.round(c / 100)).toLocaleString("en-US")}`;
const exact = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const md = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Everything that could notify right now. The phone keeps the kinds it's set to and posts new keys. */
export async function phoneAlerts(): Promise<PhoneAlert[]> {
  const plan = await getMonthPlan();
  const today = plan.today;
  const out: PhoneAlert[] = [];
  const [cards, cash, review, uncategorized, auto, conn, reserve] = await Promise.all([
    listCardPayments(today).catch(() => []),
    getCashTiming(plan.debt.cents).catch(() => null),
    getReview().catch(() => null),
    needsCategory().catch(() => []),
    recentAutomation().catch(() => null),
    prisma.bankConnection.findUnique({ where: { id: "default" }, select: { lastSuccessAt: true } }).catch(() => null) as Promise<{ lastSuccessAt: Date | null } | null>,
    reserveSetting(),
  ]);

  for (const b of plan.bills.items) {
    if (b.status === "due" && b.dueOn === today) out.push({ key: `billDue:${b.lineItemId}:${b.dueOn}`, kind: "billDue", title: `${b.name} is due today`, body: whole(b.cents), open: "tracker" });
    if (b.status === "overdue") out.push({ key: `billOverdue:${b.lineItemId}:${b.dueOn}`, kind: "billOverdue", title: `${b.name} was due ${md(b.dueOn)}`, body: `No payment seen yet · ${whole(b.cents)}`, open: "tracker" });
  }
  for (const r of auto?.recorded ?? []) {
    if (r.paidOn && r.paidOn >= addDays(today, -2)) out.push({ key: `billAuto:${r.lineItemId}:${r.year}-${r.month}`, kind: "billAuto", title: `${r.name} recorded`, body: `${exact(r.amountCents)} on ${md(r.paidOn)}`, open: "review" });
  }
  for (const c of cards) {
    if (c.dueCents > 0 && c.nextDue >= today && c.nextDue <= addDays(today, 2)) out.push({ key: `cardDue:${c.id}:${c.nextDue}`, kind: "cardDue", title: `${c.name} · pay ${whole(c.suggestedCents || c.dueCents)} by ${md(c.nextDue)}`, body: `${whole(c.dueCents)} left on the statement`, open: "cards" });
    if (c.lastClose >= addDays(today, -3) && c.lastClose <= today && c.statementCents > 0) out.push({ key: `statement:${c.id}:${c.lastClose}`, kind: "statementClosed", title: `${c.name} statement closed at ${whole(c.statementCents)}`, body: `Due ${md(c.nextDue)}`, open: "cards" });
  }
  for (const i of plan.income.items) {
    if (i.received && i.dueOn >= addDays(today, -2)) out.push({ key: `payday:${i.lineItemId}:${i.dueOn}`, kind: "payday", title: `${whole(i.cents)} landed`, body: i.name, open: "today" });
  }
  if (cash && !cash.missing && cash.shortOn) {
    const minimum = await cushionSetting().catch(() => 0);
    out.push({ key: `short:${cash.shortOn}`, kind: "short", title: `Checking may run short on ${md(cash.shortOn)}`, body: `It would drop to ${whole(cash.lowCents)}${minimum ? ` (cushion ${whole(minimum)})` : ""}`, open: "insights" });
  }
  const recent = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: new Date(`${addDays(today, -2)}T00:00:00Z`) }, kind: "NORMAL", amount: { lte: -100 }, account: { hidden: false, type: { in: ["CHECKING", "CREDIT_CARD"] } } },
    select: { id: true, merchant: true, amount: true, account: { select: { name: true, nickname: true } } },
    take: 50,
  }).catch(() => [])) as Array<{ id: string; merchant: string; amount: { toString(): string }; account: { name: string; nickname: string | null } }>;
  for (const t of recent) {
    const cents = -toCents(t.amount);
    out.push({ key: `large:${t.id}`, kind: "largeCharge", title: `${exact(cents)} at ${t.merchant}`, body: t.account.nickname || t.account.name, open: "transactions", cents });
  }
  for (const g of plan.groups.filter((x) => x.overCents > 0 && x.tier !== "SORT")) out.push({ key: `over:${g.id}:${plan.month}`, kind: "budgetOver", title: `${g.name} is ${whole(g.overCents)} over`, body: `For ${new Date(`${plan.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}`, open: "budget" });
  const unplanned = plan.groups.filter((g) => g.tier === "UNPLANNED").reduce((s, g) => s + g.spentCents, 0);
  if (reserve > 0 && unplanned > reserve) out.push({ key: `reserve:${plan.month}`, kind: "reserveUsed", title: "Unplanned spending passed the reserve", body: `${whole(unplanned)} of ${whole(reserve)}`, open: "budget" });
  const toReview = (review?.count ?? 0) + uncategorized.length;
  if (toReview) out.push({ key: `review:${today}`, kind: "review", title: `${toReview} ${toReview === 1 ? "item" : "items"} to review`, body: "Open Review to check them", open: "review" });
  const lastSync = conn?.lastSuccessAt ?? null;
  if (lastSync && Date.now() - lastSync.getTime() > 24 * 3_600_000) out.push({ key: `sync:${lastSync.toISOString()}`, kind: "syncStopped", title: "No new bank data for a day", body: "Check the bank connection on the web", open: "today" });
  const { amazonAlert } = await import("./amazon-alert");
  const amazon = await amazonAlert().catch(() => null);
  if (amazon) out.push({ key: amazon.key, kind: "amazonSync", title: amazon.title, body: amazon.body, open: "today" });
  // The weekly summary: the phone posts it on Sunday evening.
  const week = isoWeek(today);
  const left = forecastTotals(planForecastRows(plan));
  const paidThisWeek = plan.bills.items.filter((b) => b.status === "paid" && b.paidOn && b.paidOn >= addDays(today, -6)).length;
  out.push({ key: `weekly:${week}`, kind: "weekly", title: "This week", body: `${whole(left.budgetCents + reserve - left.spentCents)} budget left · ${paidThisWeek} ${paidThisWeek === 1 ? "bill" : "bills"} paid`, open: "insights" });
  return out;
}

function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - (d.getUTCDay() || 7)));
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - start.getTime()) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;
}
