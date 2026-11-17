/**
 * Spending envelopes (src/lib/envelopes.ts), gathered for the pay period in
 * progress: the period from the pay calendar, a period's share of the plan's
 * income and bills, usual spending per group from the last twelve complete
 * months, and what each group has spent since payday.
 *
 * Without a pay calendar the period is the calendar month.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { SPENDING_TYPES, type AccountType } from "@/lib/account-type";
import { isIncomeCategory } from "@/lib/category-guess";
import { allowance } from "@/lib/allowance";
import { PERIODS_PER_YEAR, assignLimits, carried, payoffDate, perPeriod, share, standing, totals, type EnvelopeIn, type GroupTier, type Standing, type Tier } from "@/lib/envelopes";
import { DEFAULT_GROUPS, OTHER_GROUP, defaultGroupFor } from "@/lib/envelope-defaults";
import { loadPlan } from "./allowance";
import { getMonthView } from "./month";
import { listCardPayments } from "./card-payments";
import { getSettings } from "./settings";
import { paydayPlan, type PaydayPlan } from "@/lib/payday-plan";
import { loadPaydays } from "./pay-split";
import { payoffTrackers } from "./card-payments";
import { billCharge } from "./bill-merchants";
import { NotFoundError, ValidationError } from "./errors";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => Date.parse(`${s}T00:00:00Z`);
/** How many pay periods' worth of unused money an essential or planned envelope keeps. */
const CARRY_PERIODS = 2;
const KEY_DEBT = "envelopeDebtCents";
const KEY_SEEDED = "envelopesSeededAt";
const KEY_PLACED = "envelopesPlacedAt";

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export interface EnvelopeView extends EnvelopeIn {
  /** The limit is worked out, not set by the person. */
  automatic: boolean;
  /** Usual spending per pay period. */
  averageCents: number;
  leftCents: number;
  overCents: number;
  gaveCents: number;
  saveUp: boolean;
  saveUpTargetCents: number | null;
  categories: Array<{ id: string | null; name: string; spentCents: number }>;
}

export interface EnvelopesView {
  period: {
    /** The payday the period began (or the 1st, without a pay calendar). YYYY-MM-DD */
    from: string;
    /** The next payday (or the next 1st). */
    next: string;
    daysLeft: number;
    days: number;
    perYear: number;
    byPayday: boolean;
    /** "period": payday to payday. "month": the calendar month. */
    view: "period" | "month";
  };
  /** Every envelope's money left, less any overage nothing covered. */
  allLeftCents: number;
  /** Spending past what the period had, that nothing covered. */
  allOverCents: number;
  byTier: Record<Tier, { leftCents: number; overCents: number }>;
  /** "due": bills and income due in this period, from the plan. "average": a period's share of the year. */
  basis: "due" | "average";
  /** A pay period's share of each step. */
  incomeCents: number;
  incomeSource: "plan" | "bank";
  billsCents: number;
  essentialCents: number;
  plannedCents: number;
  flexibleCents: number;
  /** Flexible money no envelope needed. */
  unassignedCents: number;
  /** The steps before flexible need more than the income by this much. */
  planShortCents: number;
  debt: {
    perPeriodCents: number;
    /** Worked out from the plan's payments, not set by the person. */
    automatic: boolean;
    /** Where the amount came from: set by the person, the plan's payments, or about 1% of the balance a month. */
    source: "set" | "plan" | "minimum";
    name: string | null;
    balanceCents: number | null;
    /** When the 0% offer ends. */
    endsOn: string | null;
    /** When the balance clears at this payment. */
    doneOn: string | null;
    /** What each pay period would need to be to clear it in time. */
    neededCents: number | null;
  };
  flexibleLeftCents: number;
  perDayCents: number;
  coveredCents: number;
  shortCents: number;
  standing: Standing;
  /** One plain sentence when something needs attention. */
  message: string | null;
  /** Flexible money not spent in the pay period before, which could go to debt. */
  lastPeriod: { from: string; to: string; leftoverCents: number } | null;
  groups: EnvelopeView[];
  /** Categories in no group, to place. */
  unplaced: number;
  /** Charts. Spending each day of this period (every budget), and what the budgets had. */
  daily: Array<{ date: string; spentCents: number }>;
  hadCents: number;
  /** The recent pay periods (or months): money in against money out. */
  history: Array<{ from: string; to: string; inCents: number; outCents: number; current: boolean }>;
  /** The 0% balance over time, and where it heads at this payment. */
  debtChart: { points: Array<{ date: string; cents: number }>; projected: Array<{ date: string; cents: number }> } | null;
  /** What to do with the paycheck now, when this is the pay period view. */
  payday: (PaydayPlan & { isPayday: boolean; bills: Array<{ name: string; dueOn: string; cents: number }>; debtName: string | null; debtDueOn: string | null }) | null;
}

type GroupRow = { id: string; name: string; tier: GroupTier; sortOrder: number; limitCents: number | null; saveUp: boolean; saveUpTargetCents: number | null; saveUpSince: Date | null };

async function setting<T>(key: string): Promise<T | null> {
  const row = (await prisma.setting.findUnique({ where: { key } })) as { value: unknown } | null;
  return row && row.value !== null ? (row.value as T) : null;
}
async function saveSetting(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
}

/**
 * The starting envelopes, made once from the category names in use; after
 * that, categories created since the last look are placed the same way.
 */
export async function ensureGroups(): Promise<void> {
  const seededAt = await setting<string>(KEY_SEEDED);
  const placedAt = (await setting<string>(KEY_PLACED)) ?? seededAt;
  const now = new Date().toISOString();
  const categories = (await prisma.category.findMany({
    where: { groupId: null, managedForOthers: false, ...(placedAt ? { createdAt: { gt: new Date(placedAt) } } : {}) },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  const wanted = new Map<string, string[]>();
  for (const c of categories) {
    if (isIncomeCategory(c.name)) continue;
    const group = defaultGroupFor(c.name);
    if (group) wanted.set(group, [...(wanted.get(group) ?? []), c.id]);
  }
  if (wanted.size) {
    const existing = (await prisma.categoryGroup.findMany({ select: { id: true, name: true } })) as Array<{ id: string; name: string }>;
    const byName = new Map(existing.map((g) => [g.name, g.id]));
    for (const [name, ids] of wanted) {
      let id = byName.get(name);
      // After the first time, only groups that still exist take new categories: a removed group stays removed.
      if (!id && !seededAt) {
        const d = DEFAULT_GROUPS.find((g) => g.name === name)!;
        const made = (await prisma.categoryGroup.create({
          data: { name, tier: d.tier, sortOrder: DEFAULT_GROUPS.indexOf(d), saveUp: !!d.saveUp, saveUpSince: d.saveUp ? new Date(`${localToday()}T00:00:00Z`) : null },
          select: { id: true },
        })) as { id: string };
        id = made.id;
      }
      if (id) await prisma.category.updateMany({ where: { id: { in: ids } }, data: { groupId: id } });
    }
  }
  if (!seededAt) await saveSetting(KEY_SEEDED, now);
  await saveSetting(KEY_PLACED, now);
}

/** The pay period in progress, and the one before it. */
async function currentPeriod(today: string, monthOnly = false) {
  const paydays = await loadPaydays();
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const days: string[] = [];
  for (let k = -3; k <= 3; k++) {
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    for (const p of paydays(d.getUTCFullYear(), d.getUTCMonth() + 1)) days.push(iso(p));
  }
  days.sort();
  const frequency = paydays.frequency(y, m);
  const past = days.filter((d) => d <= today);
  const future = days.filter((d) => d > today);
  if (!monthOnly && frequency && past.length && future.length) {
    return {
      from: past[past.length - 1], next: future[0], prevFrom: past.length > 1 ? past[past.length - 2] : null,
      /** Where the recent pay periods began, oldest first, ending with the current one. */
      recent: past.slice(-8),
      perYear: PERIODS_PER_YEAR[frequency] as number, byPayday: true, view: "period" as const,
      /** Where each pay period since `since` began: `since`, then every payday after it up to the current period's. */
      boundaries: (since: string, from: string) => {
        const out = [since];
        const start = new Date(`${since}T00:00:00Z`);
        for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); iso(d) <= from; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
          for (const p of paydays(d.getUTCFullYear(), d.getUTCMonth() + 1)) if (iso(p) > since && iso(p) <= from) out.push(iso(p));
        }
        return out;
      },
    };
  }
  const first = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm - 1, 1)));
  return {
    from: first(y, m), next: first(y, m + 1), prevFrom: first(y, m - 1), perYear: 12, byPayday: false, view: "month" as const,
    recent: Array.from({ length: 6 }, (_, k) => first(y, m - 5 + k)),
    boundaries: (since: string, from: string) => {
      const out = [since];
      const a = new Date(`${since}T00:00:00Z`);
      for (let d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1)); iso(d) <= from; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) out.push(iso(d));
      return out;
    },
  };
}

/** The payday plan with what's in checking now. */
async function paydayFor(checkingCents: number, bills: Array<{ name: string; dueOn: string; cents: number }>, debtCents: number, today: string, isPayday: boolean): Promise<EnvelopesView["payday"]> {
  const [cards, settings, colors] = await Promise.all([
    listCardPayments(today),
    getSettings(),
    prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD" }, select: { id: true, cardColor: true } }) as Promise<Array<{ id: string; cardColor: string | null }>>,
  ]);
  const color = new Map(colors.map((c) => [c.id, c.cardColor]));
  const promo = cards.filter((c) => c.promoEndsOn && c.promoEndsOn >= today);
  const plan = paydayPlan({
    checkingCents,
    bills,
    debtCents,
    cards: cards
      .filter((c) => !(c.promoEndsOn && c.promoEndsOn >= today))
      .map((c) => ({ id: c.id, name: c.name, color: color.get(c.id) ?? null, dueOn: c.nextDue, statementCents: c.dueCents, owedCents: c.owedNowCents })),
    cushionCents: settings.bufferCents,
  });
  return { ...plan, isPayday, bills, debtName: promo[0]?.name ?? null, debtDueOn: promo[0]?.nextDue ?? null };
}

function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = at(from); t < at(to); t += DAY) out.push(iso(new Date(t)));
  return out;
}

/** The 0% balance week by week since it began (from the card's transactions), and where it heads. */
async function debtChart(
  trackers: Array<{ id: string; balanceCents: number; startOn: string | null; endsOn: string }>,
  perPeriodCents: number,
  periodDays: number,
  today: string,
): Promise<EnvelopesView["debtChart"]> {
  if (!trackers.length) return null;
  const ids = trackers.map((t) => t.id);
  const start = trackers.map((t) => t.startOn).filter((d): d is string => !!d).sort()[0] ?? iso(new Date(at(today) - 90 * DAY));
  const rows = (await prisma.bankTransaction.findMany({
    where: { accountId: { in: ids }, postedOn: { gte: new Date(`${start}T00:00:00Z`) }, pending: false },
    select: { postedOn: true, amount: true },
  })) as Array<{ postedOn: Date; amount: { toString(): string } }>;
  const balance = trackers.reduce((s, t) => s + t.balanceCents, 0);
  // Walk back from today's balance: owed before a charge was less, before a payment more.
  const points: Array<{ date: string; cents: number }> = [];
  for (let t = at(today); t >= at(start); t -= 7 * DAY) {
    const d = iso(new Date(t));
    const after = rows.filter((r) => iso(r.postedOn) > d).reduce((s, r) => s + toCents(r.amount), 0);
    points.unshift({ date: d, cents: Math.max(0, balance + after) });
  }
  if (points[0]?.date !== start) points.unshift({ date: start, cents: Math.max(0, balance + rows.filter((r) => iso(r.postedOn) >= start).reduce((s, r) => s + toCents(r.amount), 0)) });
  const projected: Array<{ date: string; cents: number }> = [{ date: today, cents: balance }];
  const ends = trackers.map((t) => t.endsOn).sort()[0];
  let owed = balance;
  for (let t = at(today) + periodDays * DAY; owed > 0 && perPeriodCents > 0 && projected.length < 400; t += periodDays * DAY) {
    owed = Math.max(0, owed - perPeriodCents);
    const d = iso(new Date(t));
    projected.push({ date: d, cents: owed });
    if (d > ends && projected.length > 2 && iso(new Date(t)) > iso(new Date(at(ends) + 365 * DAY))) break;
  }
  return { points, projected };
}

export async function getEnvelopes(view: "period" | "month" = "period"): Promise<EnvelopesView> {
  await ensureGroups();
  const today = localToday();
  const period = await currentPeriod(today, view === "month");
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const windowStart = new Date(Date.UTC(y, m - 1 - 12, 1));
  const monthStart = new Date(Date.UTC(y, m - 1, 1));

  const [plan, groups, categories, txns, isBill, debtSetting, seededAt, trackers, promoItems] = await Promise.all([
    loadPlan(),
    prisma.categoryGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) as Promise<GroupRow[]>,
    prisma.category.findMany({ select: { id: true, name: true, groupId: true, managedForOthers: true } }) as Promise<Array<{ id: string; name: string; groupId: string | null; managedForOthers: boolean }>>,
    prisma.bankTransaction.findMany({
      where: { postedOn: { gte: new Date(Math.min(windowStart.getTime(), period.prevFrom ? at(period.prevFrom) : windowStart.getTime())) }, kind: "NORMAL", account: { hidden: false } },
      select: {
        postedOn: true, amount: true, merchant: true, categoryId: true, pending: true,
        category: { select: { name: true, managedForOthers: true } },
        account: { select: { type: true } },
        actual: { select: { id: true } },
        splits: { select: { categoryId: true, amount: true } },
      },
    }) as Promise<Array<{ postedOn: Date; amount: { toString(): string }; merchant: string; categoryId: string | null; pending: boolean; category: { name: string; managedForOthers: boolean } | null; account: { type: AccountType }; actual: { id: string } | null; splits: Array<{ categoryId: string | null; amount: { toString(): string } }> }>>,
    billCharge(),
    setting<number>(KEY_DEBT),
    setting<string>(KEY_SEEDED),
    payoffTrackers(today).catch(() => []),
    prisma.lineItem.findMany({
      where: { active: true, paysCard: { bankAccount: { promoEndsOn: { gte: new Date(`${today}T00:00:00Z`) } } } },
      select: { id: true },
    }) as Promise<Array<{ id: string }>>,
  ]);

  // Categories paid through the plan's bills: step 1 counts them, so the envelopes skip them.
  const billGroups = new Set(groups.filter((g) => g.tier === "BILLS").map((g) => g.id));
  const groupOf = new Map(categories.map((c) => [c.id, c.groupId ?? OTHER_GROUP.id]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  // Everyday spending, as on Insights: money out that isn't a bill, less refunds.
  const months = new Map<string, Map<number, number>>(); // group -> month number -> cents
  const now = new Map<string, Map<string, number>>(); // group -> category ("" for none) -> cents
  const before = new Map<string, number>();
  // Envelopes that carry a balance: when each began, and where its pay periods since then start.
  const windowDay = iso(windowStart);
  const began = (day: string) => (day > period.from ? period.from : day < windowDay ? windowDay : day);
  const startedOn = began(seededAt ? seededAt.slice(0, 10) : today);
  const carryFrom = new Map<string, string>();
  for (const g of groups) {
    if (g.saveUp) carryFrom.set(g.id, began(g.saveUpSince ? iso(g.saveUpSince) : today));
    else if (g.tier !== "FLEXIBLE") carryFrom.set(g.id, startedOn);
  }
  const bounds = new Map([...carryFrom].map(([id, since]) => [id, period.boundaries(since, period.from)]));
  const past = new Map<string, number[]>(); // group -> spending in each completed period since it began
  const deposits = new Map<number, number>();
  let firstMonth: number | null = null;
  const ymn = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  const hist = period.recent.map(() => ({ in: 0, out: 0 }));
  const dailyMap = new Map<string, number>();
  for (const t of txns) {
    if (t.category?.managedForOthers) continue;
    const spending = SPENDING_TYPES.includes(t.account.type);
    const cents = toCents(t.amount);
    let everyday = 0;
    if (cents < 0 && spending) {
      if (!isBill(t)) everyday = -cents;
    } else if (cents > 0) {
      const refund = spending && (t.account.type === "CREDIT_CARD" || (t.categoryId !== null && !isIncomeCategory(t.category?.name)));
      if (refund && !isBill(t)) everyday = -cents;
      else if (!refund && (spending || t.account.type === "SAVINGS") && !t.pending && t.postedOn < monthStart && t.postedOn >= windowStart) {
        deposits.set(ymn(t.postedOn), (deposits.get(ymn(t.postedOn)) ?? 0) + cents);
      }
    }
    // Money in and out per recent period, for the history chart.
    {
      const d = iso(t.postedOn);
      const i = period.recent.length ? period.recent.findLastIndex((b: string) => d >= b) : -1;
      if (i >= 0 && !t.pending) {
        const h = hist[i];
        if (cents < 0 && spending) h.out += -cents;
        else if (cents > 0 && spending && t.account.type === "CREDIT_CARD") h.out -= cents;
        else if (cents > 0 && (spending || t.account.type === "SAVINGS")) {
          const refund = t.categoryId !== null && !isIncomeCategory(t.category?.name);
          if (refund) h.out -= cents;
          else h.in += cents;
        }
      }
    }
    if (!everyday) continue;
    // A split charge counts in its parts' categories, in proportion.
    const parts: Array<{ categoryId: string | null; cents: number }> = t.splits.length
      ? t.splits.map((s) => ({ categoryId: s.categoryId, cents: cents !== 0 ? Math.round((everyday * toCents(s.amount)) / cents) : 0 }))
      : [{ categoryId: t.categoryId, cents: everyday }];
    for (const part of parts) {
    const categoryId = part.categoryId;
    const everydayPart = part.cents;
    const group = categoryId ? (groupOf.get(categoryId) ?? OTHER_GROUP.id) : OTHER_GROUP.id;
    if (billGroups.has(group) || !everydayPart) continue;
    const day = iso(t.postedOn);
    if (!t.pending && t.postedOn >= windowStart && t.postedOn < monthStart) {
      const n = ymn(t.postedOn);
      const g = months.get(group) ?? new Map<number, number>();
      g.set(n, (g.get(n) ?? 0) + everydayPart);
      months.set(group, g);
      if (firstMonth === null || n < firstMonth) firstMonth = n;
    }
    if (day >= period.from && day <= today) {
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + everydayPart);
      const g = now.get(group) ?? new Map<string, number>();
      g.set(categoryId ?? "", (g.get(categoryId ?? "") ?? 0) + everydayPart);
      now.set(group, g);
    } else if (period.prevFrom && day >= period.prevFrom && day < period.from) {
      before.set(group, (before.get(group) ?? 0) + everydayPart);
    }
    const b = bounds.get(group);
    if (b && day >= b[0] && day < period.from) {
      let i = b.length - 2;
      while (i > 0 && day < b[i]) i--;
      const spent = past.get(group) ?? new Array<number>(Math.max(0, b.length - 1)).fill(0);
      if (i >= 0 && i < spent.length) spent[i] += everydayPart;
      past.set(group, spent);
    }
    }
  }
  // Months of history behind the averages: from the first month with spending, at most twelve.
  const history = firstMonth === null ? 1 : Math.max(1, Math.min(12, ymn(monthStart) - firstMonth));
  const usual = (id: string) => perPeriod(Math.round([...(months.get(id)?.values() ?? [])].reduce((a, b) => a + b, 0) / history), period.perYear);

  // A pay period's share of the plan.
  const recentDeposits = [...deposits.entries()].sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, v]) => v);
  const depositsCents = recentDeposits.length ? Math.round(recentDeposits.reduce((a, b) => a + b, 0) / recentDeposits.length) : 0;
  const a = allowance({ rows: plan?.rows ?? [], payoffCents: 0, depositsCents, recentEveryday: [], recentOnCards: [], spentCents: 0, projectedCents: null, day: 1, daysInMonth: 30 });
  // Bills and income due in this period, from the plan, as they actually fall: a tight
  // paycheck shows as tight. Without a plan, a period's share of recent deposits.
  let incomeCents = perPeriod(a.incomeCents, period.perYear);
  let billsCents = perPeriod(a.fixedBillsCents, period.perYear);
  let basis: "due" | "average" = "average";
  const unpaid: Array<{ name: string; dueOn: string; cents: number }> = [];
  let checkingCents: number | null = null;
  if (plan?.rows.length && a.incomeSource === "plan") {
    const cardPayment = new Map(plan.rows.map((r) => [r.lineItemId, r.cardPayment]));
    const months: Array<{ y: number; m: number }> = [];
    for (let d = new Date(`${period.from.slice(0, 8)}01T00:00:00Z`); iso(d) < period.next; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
    }
    let dueIncome = 0;
    let dueBills = 0;
    unpaid.length = 0;
    for (const { y: yy, m: mm } of months) {
      const v = await getMonthView(yy, mm);
      if (yy === y && mm === m) checkingCents = v.billsBalanceCents;
      const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      const when = (dueDay: number | null) => iso(new Date(Date.UTC(yy, mm - 1, Math.min(last, Math.max(1, dueDay ?? 1)))));
      const inPeriod = (dueDay: number | null) => {
        const d = when(dueDay);
        return d >= period.from && d < period.next;
      };
      const amount = (e: { skipped: boolean; actualCents: number | null; budgetedCents: number }) => (e.skipped ? 0 : (e.actualCents ?? e.budgetedCents));
      for (const e of v.income) if (inPeriod(e.dueDay)) dueIncome += amount(e);
      for (const h of v.halves) {
        for (const e of h.entries) {
          if (e.kind === "INCOME" || e.paidFromSurplus || cardPayment.get(e.lineItemId)) continue;
          if (inPeriod(e.dueDay)) {
            dueBills += amount(e);
            if (e.actualCents === null && !e.skipped && e.budgetedCents > 0) unpaid.push({ name: e.name, dueOn: when(e.dueDay), cents: e.budgetedCents });
          }
        }
      }
    }
    incomeCents = dueIncome;
    billsCents = dueBills;
    basis = "due";
  }

  // The debt payment: what the person set, else the plan's payments toward 0% cards.
  const promoIds = new Set(promoItems.map((i) => i.id));
  const planned = (plan?.rows ?? []).filter((r) => promoIds.has(r.lineItemId)).reduce((s, r) => s + Math.round(r.months.reduce((x, v) => x + v, 0) / 12), 0);
  const periodDays = Math.max(1, Math.round((at(period.next) - at(period.from)) / DAY));
  const balance = trackers.length ? trackers.reduce((s, t) => s + t.balanceCents, 0) : null;
  // Nothing in the plan pays the 0% card: hold back about the usual minimum (1% of the balance a month).
  const debtSource: "set" | "plan" | "minimum" = debtSetting !== null ? "set" : planned > 0 || !balance ? "plan" : "minimum";
  const debtCents = debtSetting ?? perPeriod(debtSource === "minimum" ? Math.ceil((balance ?? 0) / 100) : planned, period.perYear);
  const endsOn = trackers.length ? trackers.map((t) => t.endsOn).sort()[0] : null;
  const periodsToEnd = endsOn ? Math.max(1, Math.floor((at(endsOn) - at(today)) / DAY / periodDays)) : null;

  const all: Array<(GroupRow & { tier: Tier }) | (typeof OTHER_GROUP & { limitCents: null; saveUp: false; saveUpTargetCents: null; saveUpSince: null; sortOrder: number })> = [
    ...(groups.filter((g) => g.tier !== "BILLS") as Array<GroupRow & { tier: Tier }>),
    { ...OTHER_GROUP, limitCents: null, saveUp: false, saveUpTargetCents: null, saveUpSince: null, sortOrder: 9_999 },
  ];
  const limits = assignLimits({
    incomeCents, billsCents, debtCents,
    groups: all.map((g) => ({ id: g.id, tier: g.tier, manualCents: g.limitCents, averageCents: usual(g.id) })),
  });

  const inputs: EnvelopeIn[] = [];
  for (const g of all) {
    const limitCents = limits.limits.get(g.id) ?? 0;
    const spentCents = [...(now.get(g.id)?.values() ?? [])].reduce((x, v) => x + v, 0);
    let carriedCents: number | undefined;
    const b = bounds.get(g.id);
    if (b) {
      const spent = past.get(g.id) ?? new Array<number>(Math.max(0, b.length - 1)).fill(0);
      // Essentials and planned spending keep up to two more pay periods' worth; a save-up keeps everything.
      carriedCents = carried(limitCents, spent, g.saveUp ? null : limitCents * CARRY_PERIODS);
    }
    inputs.push({ id: g.id, name: g.name, tier: g.tier, limitCents, spentCents, carriedCents });
  }
  // Flexible money no envelope needed is real money too: it covers overages first, and what's left is extra.
  const EXTRA = { id: "extra", name: "Not budgeted", tier: "FLEXIBLE" as Tier };
  if (limits.unassignedCents > 0) inputs.push({ ...EXTRA, limitCents: limits.unassignedCents, spentCents: 0 });
  const shared = share(inputs);
  const sum = (tier: Tier) => all.filter((g) => g.tier === tier).reduce((s, g) => s + (limits.limits.get(g.id) ?? 0), 0);
  const daysLeft = Math.max(1, Math.round((at(period.next) - at(today)) / DAY));
  const sums = totals(shared);
  // The headline is everything left: "low" under a tenth of what the envelopes had, "short" once spending passes it.
  const had = all.reduce((s, g) => s + (limits.limits.get(g.id) ?? 0), 0);
  const state: Standing = sums.overCents > 0 ? "short" : sums.leftCents <= 0 ? "empty" : had > 0 && sums.leftCents < had / 10 ? "low" : "ok";
  void standing;

  const byId = new Map<string, { limitCents: number | null; saveUp: boolean; saveUpTargetCents: number | null }>(all.map((g) => [g.id, g]));
  byId.set(EXTRA.id, { limitCents: 0, saveUp: false, saveUpTargetCents: null });
  const views: EnvelopeView[] = shared.envelopes
    .map((e) => {
      const g = byId.get(e.id)!;
      return {
        ...e,
        automatic: g.limitCents === null,
        averageCents: usual(e.id),
        saveUp: g.saveUp,
        saveUpTargetCents: g.saveUpTargetCents,
        categories: [...(now.get(e.id)?.entries() ?? [])]
          .map(([id, cents]) => ({ id: id || null, name: id ? (categoryName.get(id) ?? "Category") : "Uncategorized", spentCents: cents }))
          .sort((x, z) => z.spentCents - x.spentCents),
      };
    })
    // An envelope with no money and no spending (its categories are all paid as bills, say) is left off.
    .filter((e) => e.spentCents !== 0 || e.limitCents > 0 || (e.carriedCents ?? 0) !== 0);

  const money = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
  const nextLabel = new Date(`${period.next}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const over = views.filter((e) => e.overCents > 0).sort((x, z) => z.overCents - x.overCents)[0];
  const givers = views.filter((e) => e.gaveCents > 0).map((e) => e.name);
  const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  let message: string | null = null;
  const planShort = Math.max(0, -(incomeCents - billsCents - debtCents - sum("ESSENTIAL") - sum("PLANNED"))) + limits.shortCents;
  const each = period.view === "month" ? "this month's pay" : period.byPayday ? "this paycheck" : "this month's pay";
  if (sums.overCents > 0) {
    message = `Spending is ${money(sums.overCents)} past what ${each} had for it. That much will sit on a card you can't pay in full unless other spending stops until ${nextLabel}.`;
  } else if (planShort > 0) {
    message = `Bills, essentials, planned spending and the debt payment take ${money(planShort)} more than ${each} brings in, so there's no flexible money. Lower a limit to make room.`;
  } else if (state === "empty") {
    message = `Everything is spent until ${nextLabel}. Anything more goes on a card you can't pay in full.`;
  } else if (over) {
    const overs = views.filter((e) => e.overCents > 0);
    const overTotal = overs.reduce((s, e) => s + e.overCents, 0);
    message =
      overs.length === 1
        ? `${over.name} is used up. The ${money(over.overCents)} over came out of ${list(givers)}.`
        : `${list(overs.map((e) => e.name))} ran over, ${money(overTotal)} in all. It came out of ${list(givers)}.`;
  } else if (state === "low") {
    message = `Less than a tenth of the money for ${period.view === "month" ? "this month" : "this pay period"} is left.`;
  }

  let lastPeriod: EnvelopesView["lastPeriod"] = null;
  if (period.prevFrom) {
    const prev = share([
      ...all.filter((g) => !g.saveUp).map((g) => ({ id: g.id, name: g.name, tier: g.tier, limitCents: limits.limits.get(g.id) ?? 0, spentCents: before.get(g.id) ?? 0 })),
      ...(limits.unassignedCents > 0 ? [{ ...EXTRA, limitCents: limits.unassignedCents, spentCents: 0 }] : []),
    ]);
    const spentAny = [...before.values()].some((v) => v !== 0);
    if (spentAny) lastPeriod = { from: period.prevFrom, to: period.from, leftoverCents: Math.max(0, prev.flexibleLeftCents) };
  }

  return {
    period: { from: period.from, next: period.next, daysLeft, days: periodDays, perYear: period.perYear, byPayday: period.byPayday, view: period.view },
    allLeftCents: sums.leftCents,
    allOverCents: sums.overCents,
    byTier: sums.byTier,
    basis,
    incomeCents,
    incomeSource: a.incomeSource,
    billsCents,
    essentialCents: sum("ESSENTIAL"),
    plannedCents: sum("PLANNED"),
    flexibleCents: limits.flexibleCents,
    unassignedCents: limits.unassignedCents,
    planShortCents: planShort,
    debt: {
      perPeriodCents: debtCents,
      automatic: debtSetting === null,
      source: debtSource,
      name: trackers.length === 1 ? trackers[0].name : trackers.length ? "0% balances" : null,
      balanceCents: balance,
      endsOn,
      doneOn: balance === null ? null : payoffDate(balance, debtCents, periodDays, today),
      neededCents: balance !== null && periodsToEnd ? Math.ceil(balance / periodsToEnd) : null,
    },
    flexibleLeftCents: shared.flexibleLeftCents,
    perDayCents: Math.max(0, Math.round(sums.leftCents / daysLeft)),
    coveredCents: shared.coveredCents,
    shortCents: shared.shortCents,
    standing: state,
    message,
    lastPeriod,
    groups: views,
    unplaced: categories.filter((c) => !c.groupId && !c.managedForOthers && !isIncomeCategory(c.name)).length,
    daily: dayList(period.from, period.next).map((date) => ({ date, spentCents: date <= today ? (dailyMap.get(date) ?? 0) : 0 })),
    hadCents: inputs.reduce((s, e) => s + e.limitCents + Math.max(0, e.carriedCents ?? 0), 0),
    history: period.recent.map((from: string, i: number) => ({
      from,
      to: period.recent[i + 1] ?? period.next,
      inCents: hist[i].in,
      outCents: hist[i].out,
      current: i === period.recent.length - 1,
    })),
    debtChart: await debtChart(trackers, debtCents, periodDays, today),
    payday: view === "period" && checkingCents !== null ? await paydayFor(checkingCents, unpaid, debtCents, today, period.from === today) : null,
  };
}

// ---------------------------------------------------------------- changes

const cents = z.number().int().min(0).max(100_000_000);

/** Limits per pay period by group id; null puts a group back on automatic. */
export async function setLimits(input: unknown): Promise<void> {
  const parsed = z.record(z.string(), cents.nullable()).safeParse(input);
  if (!parsed.success) throw new ValidationError({ limits: ["Each limit is an amount, or empty for automatic"] });
  for (const [id, limitCents] of Object.entries(parsed.data)) {
    if (id === OTHER_GROUP.id) continue;
    await prisma.categoryGroup.updateMany({ where: { id }, data: { limitCents } });
  }
}

export async function resetLimits(): Promise<void> {
  await prisma.categoryGroup.updateMany({ data: { limitCents: null } });
}

/** What goes to debt each pay period; null for automatic. */
export async function setDebtPayment(value: number | null): Promise<void> {
  if (value !== null && !cents.safeParse(value).success) throw new ValidationError({ debt: ["Enter an amount"] });
  await saveSetting(KEY_DEBT, value);
}

const groupInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name it").max(40),
  tier: z.enum(["ESSENTIAL", "PLANNED", "FLEXIBLE", "BILLS"]),
  saveUp: z.boolean().default(false),
  saveUpTargetCents: cents.nullable().default(null),
});

export async function saveGroup(input: unknown): Promise<{ id: string }> {
  const parsed = groupInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
  const { id, name, tier, saveUp, saveUpTargetCents } = parsed.data;
  const clash = (await prisma.categoryGroup.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) }, select: { id: true } })) as { id: string } | null;
  if (clash) throw new ValidationError({ name: ["There's already a budget with that name"] });
  if (!id) {
    const last = (await prisma.categoryGroup.aggregate({ _max: { sortOrder: true } })) as { _max: { sortOrder: number | null } };
    const made = (await prisma.categoryGroup.create({
      data: { name, tier, saveUp, saveUpTargetCents: saveUp ? saveUpTargetCents : null, saveUpSince: saveUp ? new Date(`${localToday()}T00:00:00Z`) : null, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: { id: true },
    })) as { id: string };
    return made;
  }
  const current = (await prisma.categoryGroup.findUnique({ where: { id }, select: { saveUp: true, saveUpSince: true } })) as { saveUp: boolean; saveUpSince: Date | null } | null;
  if (!current) throw new NotFoundError("Budget");
  await prisma.categoryGroup.update({
    where: { id },
    data: {
      name, tier, saveUp,
      saveUpTargetCents: saveUp ? saveUpTargetCents : null,
      // Saving starts the day it's turned on, and starts over if turned off and on again.
      saveUpSince: saveUp ? (current.saveUp && current.saveUpSince ? current.saveUpSince : new Date(`${localToday()}T00:00:00Z`)) : null,
    },
  });
  return { id };
}

/** Starts over: removes every envelope and makes the suggested set again from the categories. */
export async function resetGroups(): Promise<void> {
  await prisma.categoryGroup.deleteMany({});
  await prisma.setting.deleteMany({ where: { key: { in: [KEY_SEEDED, KEY_PLACED] } } });
  await ensureGroups();
}

/** Removes an envelope; its categories fall to "Everything else". */
export async function deleteGroup(id: string): Promise<void> {
  await prisma.categoryGroup.deleteMany({ where: { id } });
}

export async function setCategoryGroup(categoryId: string, groupId: string | null): Promise<void> {
  if (groupId) {
    const group = await prisma.categoryGroup.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!group) throw new ValidationError({ groupId: ["Pick a budget"] });
  }
  const done = await prisma.category.updateMany({ where: { id: categoryId }, data: { groupId } });
  if (!done.count) throw new NotFoundError("Category");
}

export interface EnvelopeSetup {
  groups: Array<{ id: string; name: string; tier: GroupTier; saveUp: boolean; saveUpTargetCents: number | null; limitCents: number | null; categories: Array<{ id: string; name: string }> }>;
  ungrouped: Array<{ id: string; name: string }>;
}

export async function getEnvelopeSetup(): Promise<EnvelopeSetup> {
  await ensureGroups();
  const [groups, categories] = await Promise.all([
    prisma.categoryGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) as Promise<GroupRow[]>,
    prisma.category.findMany({ where: { managedForOthers: false, active: true }, select: { id: true, name: true, groupId: true }, orderBy: { name: "asc" } }) as Promise<Array<{ id: string; name: string; groupId: string | null }>>,
  ]);
  const mine = categories.filter((c) => !isIncomeCategory(c.name));
  return {
    groups: groups.map((g) => ({
      id: g.id, name: g.name, tier: g.tier, saveUp: g.saveUp, saveUpTargetCents: g.saveUpTargetCents, limitCents: g.limitCents,
      categories: mine.filter((c) => c.groupId === g.id).map((c) => ({ id: c.id, name: c.name })),
    })),
    ungrouped: mine.filter((c) => !c.groupId).map((c) => ({ id: c.id, name: c.name })),
  };
}
