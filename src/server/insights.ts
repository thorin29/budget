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
import { buildSuggestions, isFeeCharge, isInterestCharge, isSteadyEveryday, type CategorySeries, type MerchantSeries, type Suggestion } from "@/lib/insight-suggestions";

export interface MonthTotal {
  year: number;
  month: number;
  everydayCents: number;
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
}

export interface ManagedLedger {
  id: string;
  name: string;
  /** Positive: money held for others right now (collected minus paid out), all time. */
  heldCents: number;
  monthInCents: number;
  monthOutCents: number;
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
}

type Row = {
  postedOn: Date;
  amount: { toString(): string };
  merchant: string;
  categoryId: string | null;
  category: { name: string; managedForOthers: boolean } | null;
  account: { type: AccountType };
  actual: { id: string } | null;
};

const ym = (year: number, month: number) => year * 12 + (month - 1);
const fromYm = (n: number) => ({ year: Math.floor(n / 12), month: (n % 12) + 1 });

export async function getInsights(year: number, month: number, monthsBack = 6): Promise<Insights> {
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
    },
  })) as Row[];

  const totals = new Map<number, MonthTotal>();
  for (let n = first; n <= end; n++) totals.set(n, { ...fromYm(n), everydayCents: 0, billsCents: 0, inCents: 0, netCents: 0 });
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
      if (r.actual) total.billsCents -= cents;
      else everyday = -cents;
    } else if (cents > 0) {
      const refund = spending && (r.account.type === "CREDIT_CARD" || (r.categoryId !== null && !isIncomeCategory(r.category?.name)));
      if (refund && !r.actual) everyday = -cents;
      else if (!refund) total.inCents += cents;
    }
    if (!everyday) continue;
    total.everydayCents += everyday;
    const key = r.categoryId ?? "";
    const cats = byCategory.get(n) ?? new Map();
    const c = cats.get(key) ?? { name: r.category?.name ?? "Uncategorized", cents: 0 };
    c.cents += everyday;
    cats.set(key, c);
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

  const months = [...totals.values()];
  const current = totals.get(end)!;
  const avgOf = prior.map((n) => totals.get(n)!.everydayCents);
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

  const zeros = () => Array.from({ length: 6 }, () => 0);
  const categories = new Map<string, CategorySeries>();
  const merchants = new Map<string, MerchantSeries & { categoryName: string | null }>();
  const interest = zeros();
  const fees = zeros();
  for (const r of rows) {
    const i = ym(r.postedOn.getUTCFullYear(), r.postedOn.getUTCMonth() + 1) - first;
    if (i < 0 || i > 5 || r.category?.managedForOthers || r.actual) continue;
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
      const c = categories.get(r.categoryId) ?? { id: r.categoryId, name: r.category.name, monthly: zeros() };
      c.monthly[i] += spend;
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
  });
}
