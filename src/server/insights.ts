/**
 * Where the money went, from the bank feed. Only ordinary transactions in
 * accounts that aren't hidden count: transfers and ignored rows are left out,
 * and categories managed for others get their own running balance instead of
 * counting as spending or income.
 *
 *  - Everyday spending: money out of checking and cards that wasn't confirmed
 *    as a bill payment, less card refunds.
 *  - Bills: money out confirmed as a bill payment.
 *  - Money in: deposits to checking and savings that aren't refunds.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { SPENDING_TYPES, type AccountType } from "@/lib/account-type";
import { isIncomeCategory } from "@/lib/category-guess";
import { faceName } from "@/lib/card-colors";
import { billCharge } from "./bill-merchants";
import { buildSuggestions, isFeeCharge, isInterestCharge, isSteadyEveryday, type CategorySeries, type MerchantSeries, type Suggestion } from "@/lib/insight-suggestions";

export interface MonthTotal {
  year: number;
  month: number;
  everydayCents: number;
  /** Of the everyday spending, what went on credit cards. */
  onCardsCents: number;
  billsCents: number;
  inCents: number;
  /** Money in less everyday spending and bills. */
  netCents: number;
}

export interface CategorySpend {
  id: string | null;
  name: string;
  cents: number;
  /** Average of the three months before. */
  averageCents: number;
  /** The same month a year before, when there's history for it. */
  lastYearCents: number | null;
}

export interface ManagedLedger {
  id: string;
  name: string;
  /** Positive: money held for others right now (collected minus paid out), all time. */
  heldCents: number;
  monthInCents: number;
  monthOutCents: number;
}

/** How the month in progress compares with a usual month by the same day. */
export interface Pace {
  day: number;
  daysInMonth: number;
  soFarCents: number;
  /** Average everyday spending of the three months before, through the same day. */
  usualByNowCents: number;
  /** Average everyday spending of the three months before, whole months. */
  usualMonthCents: number;
  /** So far, plus what a usual month spends from here to the end. */
  projectedCents: number;
  /** Of what's still to come this month, the part a usual month puts on cards (paid next month). */
  restOnCardsCents: number;
}

export interface Insights {
  year: number;
  month: number;
  hasData: boolean;
  months: MonthTotal[];
  current: MonthTotal;
  everydayAverageCents: number;
  categories: CategorySpend[];
  merchants: Array<{ merchant: string; cents: number; count: number }>;
  uncategorized: { count: number; cents: number };
  changes: CategorySpend[];
  managed: ManagedLedger[];
  /** Only for the month in progress, with at least one month before it. */
  pace: Pace | null;
  /** The same month a year before, when there's history for it. */
  lastYear: { everydayCents: number; billsCents: number; inCents: number } | null;
  /** Month in progress: everyday spending over the last seven days. */
  weekCents: number | null;
}

type Row = {
  postedOn: Date;
  amount: { toString(): string };
  merchant: string;
  categoryId: string | null;
  category: { name: string; managedForOthers: boolean } | null;
  account: { type: AccountType };
  actual: { id: string } | null;
  splits?: Array<{ categoryId: string | null; amount: { toString(): string }; category: { name: string } | null }>;
};

const ym = (year: number, month: number) => year * 12 + (month - 1);
const fromYm = (n: number) => ({ year: Math.floor(n / 12), month: (n % 12) + 1 });

export async function getInsights(year: number, month: number, monthsBack = 12, withLastYear = true): Promise<Insights> {
  const end = ym(year, month);
  const first = end - (monthsBack - 1);
  const start = fromYm(first);
  const rows = (await prisma.bankTransaction.findMany({
    where: {
      postedOn: { gte: new Date(Date.UTC(start.year, start.month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) },
      kind: "NORMAL",
      pending: false,
      account: { hidden: false },
    },
    select: {
      postedOn: true, amount: true, merchant: true, categoryId: true,
      category: { select: { name: true, managedForOthers: true } },
      account: { select: { type: true } },
      actual: { select: { id: true } },
      splits: { select: { categoryId: true, amount: true, category: { select: { name: true } } } },
    },
  })) as Row[];

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const isCurrent = Number(today.slice(0, 4)) === year && Number(today.slice(5, 7)) === month;
  const todayDay = Number(today.slice(8, 10));
  const byNow = new Map<number, number>();
  const onCards = new Map<number, number>();
  const weekFrom = Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000;
  let weekCents = 0;
  const isBill = await billCharge();
  const totals = new Map<number, MonthTotal>();
  for (let n = first; n <= end; n++) totals.set(n, { ...fromYm(n), everydayCents: 0, onCardsCents: 0, billsCents: 0, inCents: 0, netCents: 0 });
  // Everyday spending per month per category.
  const byCategory = new Map<number, Map<string, { name: string; cents: number }>>();
  const merchants = new Map<string, { merchant: string; cents: number; count: number }>();
  const uncategorized = { count: 0, cents: 0 };
  const monthManaged = new Map<string, { in: number; out: number }>();

  for (const r of rows) {
    const n = ym(r.postedOn.getUTCFullYear(), r.postedOn.getUTCMonth() + 1);
    const total = totals.get(n);
    if (!total) continue;
    const cents = toCents(r.amount);
    if (r.category?.managedForOthers) {
      if (n === end) {
        const m = monthManaged.get(r.categoryId!) ?? { in: 0, out: 0 };
        if (cents > 0) m.in += cents;
        else m.out -= cents;
        monthManaged.set(r.categoryId!, m);
      }
      continue;
    }
    const spending = SPENDING_TYPES.includes(r.account.type);
    if (!spending && r.account.type !== "SAVINGS") continue;

    let everyday = 0;
    if (cents < 0 && spending) {
      if (isBill(r)) total.billsCents -= cents;
      else everyday = -cents;
    } else if (cents > 0) {
      const refund = spending && (r.account.type === "CREDIT_CARD" || (r.categoryId !== null && !isIncomeCategory(r.category?.name)));
      if (refund && !isBill(r)) everyday = -cents;
      else if (!refund) total.inCents += cents;
    }
    if (!everyday) continue;
    total.everydayCents += everyday;
    // Same-day comparison, capped at each month's own length.
    if (isCurrent && r.postedOn.getUTCDate() <= todayDay) byNow.set(n, (byNow.get(n) ?? 0) + everyday);
    if (r.account.type === "CREDIT_CARD") {
      onCards.set(n, (onCards.get(n) ?? 0) + everyday);
      total.onCardsCents += everyday;
    }
    if (isCurrent && r.postedOn.getTime() >= weekFrom) weekCents += everyday;
    // A split charge (an Amazon order by item) counts in its parts' categories.
    const parts = r.splits?.length
      ? r.splits.map((p) => ({ key: p.categoryId ?? "", name: p.category?.name ?? "Uncategorized", cents: cents !== 0 ? Math.round((everyday * toCents(p.amount)) / cents) : 0 }))
      : [{ key: r.categoryId ?? "", name: r.category?.name ?? "Uncategorized", cents: everyday }];
    const cats = byCategory.get(n) ?? new Map();
    for (const part of parts) {
      const c = cats.get(part.key) ?? { name: part.name, cents: 0 };
      c.cents += part.cents;
      cats.set(part.key, c);
    }
    byCategory.set(n, cats);
    if (n === end) {
      if (everyday > 0) {
        const m = merchants.get(r.merchant) ?? { merchant: r.merchant, cents: 0, count: 0 };
        m.cents += everyday;
        m.count += 1;
        merchants.set(r.merchant, m);
      }
      if (!r.categoryId && everyday > 0) {
        uncategorized.count += 1;
        uncategorized.cents += everyday;
      }
    }
  }
  for (const t of totals.values()) t.netCents = t.inCents - t.everydayCents - t.billsCents;

  // This month by category, against the average of the three months before.
  const prior = [end - 3, end - 2, end - 1].filter((n) => n >= first);
  const names = new Map<string, string>();
  for (const n of [end, ...prior]) for (const [k, v] of byCategory.get(n) ?? []) names.set(k, v.name);
  const categories: CategorySpend[] = [...names].map(([key, name]) => ({
    id: key || null,
    name,
    cents: byCategory.get(end)?.get(key)?.cents ?? 0,
    averageCents: prior.length ? Math.round(prior.reduce((s, n) => s + (byCategory.get(n)?.get(key)?.cents ?? 0), 0) / prior.length) : 0,
    lastYearCents: null as number | null,
  }))
    .filter((c) => c.cents > 0 || c.averageCents > 0)
    .sort((a, b) => b.cents - a.cents || b.averageCents - a.averageCents);

  const changes = categories
    .filter((c) => c.id !== null && Math.max(c.cents, c.averageCents) >= 5_000 && prior.length >= 2)
    .map((c) => ({ c, delta: c.cents - c.averageCents }))
    .filter(({ c, delta }) => Math.abs(delta) >= Math.max(2_500, c.averageCents * 0.25))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
    .map(({ c }) => c);

  // Money managed for others: all-time balance per category.
  const managedCats = (await prisma.category.findMany({ where: { managedForOthers: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })) as Array<{ id: string; name: string }>;
  const managed: ManagedLedger[] = [];
  for (const c of managedCats) {
    const sum = (await prisma.bankTransaction.aggregate({
      where: { categoryId: c.id, pending: false, account: { hidden: false } },
      _sum: { amount: true },
    })) as { _sum: { amount: { toString(): string } | null } };
    const m = monthManaged.get(c.id) ?? { in: 0, out: 0 };
    managed.push({ id: c.id, name: c.name, heldCents: sum._sum.amount ? toCents(sum._sum.amount) : 0, monthInCents: m.in, monthOutCents: m.out });
  }

  // The same month a year before, for comparison: only when history reaches that far.
  let lastYear: Insights["lastYear"] = null;
  if (withLastYear) {
    const ly = await getInsights(year - 1, month, 1, false);
    if (ly.hasData) {
      lastYear = { everydayCents: ly.current.everydayCents, billsCents: ly.current.billsCents, inCents: ly.current.inCents };
      const byId = new Map(ly.categories.map((c) => [c.id ?? "", c.cents]));
      for (const c of categories) c.lastYearCents = byId.get(c.id ?? "") ?? 0;
    }
  }

  const months = [...totals.values()];
  const current = totals.get(end)!;
  const avgOf = prior.map((n) => totals.get(n)!.everydayCents);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  let pace: Pace | null = null;
  if (isCurrent && prior.length) {
    const usualMonthCents = avg(avgOf);
    const usualByNowCents = avg(prior.map((n) => byNow.get(n) ?? 0));
    const cardShare = avgOf.reduce((a, b) => a + b, 0) ? prior.reduce((a, n) => a + (onCards.get(n) ?? 0), 0) / avgOf.reduce((a, b) => a + b, 0) : 0;
    pace = {
      day: todayDay,
      daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
      soFarCents: current.everydayCents,
      usualByNowCents,
      usualMonthCents,
      projectedCents: current.everydayCents + Math.max(0, usualMonthCents - usualByNowCents),
      restOnCardsCents: Math.round(Math.max(0, usualMonthCents - usualByNowCents) * cardShare),
    };
  }
  return {
    year,
    month,
    hasData: rows.length > 0,
    months,
    current,
    everydayAverageCents: avgOf.length ? Math.round(avgOf.reduce((a, b) => a + b, 0) / avgOf.length) : 0,
    categories,
    merchants: [...merchants.values()].sort((a, b) => b.cents - a.cents).slice(0, 8),
    uncategorized,
    changes,
    managed,
    pace,
    lastYear,
    weekCents: isCurrent ? weekCents : null,
  };
}

/**
 * Suggestions from the six complete months before this one (a month still in
 * progress would read as spending going down). See src/lib/insight-suggestions.ts.
 */
export async function getSuggestions(today = new Date()): Promise<Suggestion[]> {
  const end = ym(today.getUTCFullYear(), today.getUTCMonth() + 1) - 1;
  const first = end - 5;
  const start = fromYm(first);
  const rows = (await prisma.bankTransaction.findMany({
    where: {
      postedOn: { gte: new Date(Date.UTC(start.year, start.month - 1, 1)), lt: new Date(Date.UTC(fromYm(end + 1).year, fromYm(end + 1).month - 1, 1)) },
      kind: "NORMAL",
      pending: false,
      account: { hidden: false },
    },
    select: {
      postedOn: true, amount: true, merchant: true, description: true, categoryId: true,
      category: { select: { name: true, managedForOthers: true } },
      account: { select: { type: true } },
      actual: { select: { id: true } },
    },
  })) as Array<Row & { description: string }>;

  const isBillCharge = await billCharge();
  const zeros = () => Array.from({ length: 6 }, () => 0);
  const categories = new Map<string, CategorySeries>();
  const merchants = new Map<string, MerchantSeries & { categoryName: string | null }>();
  const interest = zeros();
  const fees = zeros();
  for (const r of rows) {
    const i = ym(r.postedOn.getUTCFullYear(), r.postedOn.getUTCMonth() + 1) - first;
    if (i < 0 || i > 5 || r.category?.managedForOthers || isBillCharge(r)) continue;
    if (!SPENDING_TYPES.includes(r.account.type)) continue;
    const cents = toCents(r.amount);
    const text = `${r.description} ${r.merchant}`;
    if (cents < 0 && isInterestCharge(text)) interest[i] -= cents;
    else if (cents < 0 && isFeeCharge(text)) fees[i] -= cents;
    // Charges, less refunds on them; deposits to checking are income, not refunds.
    const refund = cents > 0 && (r.account.type === "CREDIT_CARD" || (r.categoryId !== null && !isIncomeCategory(r.category?.name)));
    if (cents >= 0 && !refund) continue;
    const spend = -cents;
    if (r.categoryId && r.category) {
      const c = categories.get(r.categoryId) ?? { id: r.categoryId, name: r.category.name, monthly: zeros(), top: Array.from({ length: 6 }, () => null) };
      c.monthly[i] += spend;
      const top = c.top![i];
      if (spend > 0 && (!top || spend > top.cents)) c.top![i] = { merchant: r.merchant.trim() || r.description, cents: spend };
      categories.set(r.categoryId, c);
    }
    if (spend > 0 && r.merchant.trim()) {
      const key = r.merchant.trim().toLowerCase();
      const m = merchants.get(key) ?? { name: r.merchant.trim(), monthly: zeros(), charges: zeros(), categoryName: r.category?.name ?? null };
      m.monthly[i] += spend;
      m.charges[i] += 1;
      merchants.set(key, m);
    }
  }

  const { listCardPayments } = await import("./card-payments");
  const promos = (await listCardPayments())
    .filter((p) => p.promoEndsOn && p.paymentsLeft && p.monthlyCents)
    .map((p) => ({ name: faceName(p.name), monthlyCents: p.monthlyCents!, paymentsLeft: p.paymentsLeft!, endsOn: p.promoEndsOn! }));

  return buildSuggestions({
    categories: [...categories.values()],
    merchants: [...merchants.values()].filter((m) => !isSteadyEveryday(m.categoryName)),
    interest,
    fees,
    promos,
    firstMonth: await firstMonthIndex(first),
    labels: Array.from({ length: 6 }, (_, i) => {
      const m = fromYm(first + i);
      return new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    }),
  });
}

/** Which of the six months from `first` the bank history begins in (0 when it reaches back further). */
async function firstMonthIndex(first: number): Promise<number> {
  const oldest = (await prisma.bankTransaction.findFirst({ orderBy: { postedOn: "asc" }, select: { postedOn: true } })) as { postedOn: Date } | null;
  if (!oldest) return 0;
  const n = ym(oldest.postedOn.getUTCFullYear(), oldest.postedOn.getUTCMonth() + 1);
  // A month the history starts partway through counts as unknown too.
  const firstFull = oldest.postedOn.getUTCDate() > 3 ? n + 1 : n;
  return Math.max(0, Math.min(6, firstFull - first));
}
