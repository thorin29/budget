/**
 * One category's everyday spending up close: twelve months of totals, this
 * month's merchants against their usual, and the charges themselves. Counts
 * the same way as Insights: ordinary charges on checking and cards that
 * weren't bill payments, less card refunds.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { SPENDING_TYPES, displayAccountName, type AccountType } from "@/lib/account-type";
import { isIncomeCategory } from "@/lib/category-guess";
import { NotFoundError } from "./errors";

export interface CategoryDetail {
  id: string | null;
  name: string;
  year: number;
  month: number;
  months: Array<{ year: number; month: number; cents: number }>;
  merchants: Array<{ merchant: string; cents: number; count: number; averageCents: number }>;
  charges: Array<{ id: string; postedOn: string; merchant: string; account: string; cents: number }>;
}

const ym = (year: number, month: number) => year * 12 + (month - 1);
const fromYm = (n: number) => ({ year: Math.floor(n / 12), month: (n % 12) + 1 });

/** `id` is a category id, or "none" for charges without one. */
export async function getCategoryDetail(id: string, year: number, month: number): Promise<CategoryDetail> {
  const categoryId = id === "none" ? null : id;
  let name = "Uncategorized";
  if (categoryId) {
    const c = (await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } })) as { name: string } | null;
    if (!c) throw new NotFoundError("Category");
    name = c.name;
  }
  const end = ym(year, month);
  const first = end - 11;
  const start = fromYm(first);
  const rows = (await prisma.bankTransaction.findMany({
    where: {
      categoryId,
      postedOn: { gte: new Date(Date.UTC(start.year, start.month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) },
      kind: "NORMAL",
      pending: false,
      account: { hidden: false },
      actual: { is: null },
    },
    select: {
      id: true, postedOn: true, amount: true, merchant: true, description: true,
      category: { select: { name: true, managedForOthers: true } },
      account: { select: { type: true, name: true, nickname: true } },
    },
    orderBy: { postedOn: "desc" },
  })) as Array<{
    id: string; postedOn: Date; amount: { toString(): string }; merchant: string; description: string;
    category: { name: string; managedForOthers: boolean } | null;
    account: { type: AccountType; name: string; nickname: string | null };
  }>;

  const totals = new Map<number, number>();
  for (let n = first; n <= end; n++) totals.set(n, 0);
  const merchants = new Map<string, { merchant: string; byMonth: Map<number, number>; count: number }>();
  const charges: CategoryDetail["charges"] = [];
  for (const r of rows) {
    if (r.category?.managedForOthers || !SPENDING_TYPES.includes(r.account.type)) continue;
    const cents = toCents(r.amount);
    const refund = cents > 0 && (r.account.type === "CREDIT_CARD" || (categoryId !== null && !isIncomeCategory(r.category?.name)));
    if (cents > 0 && !refund) continue;
    const spend = -cents;
    const n = ym(r.postedOn.getUTCFullYear(), r.postedOn.getUTCMonth() + 1);
    totals.set(n, (totals.get(n) ?? 0) + spend);
    const label = r.merchant.trim() || r.description;
    const m = merchants.get(label) ?? { merchant: label, byMonth: new Map(), count: 0 };
    m.byMonth.set(n, (m.byMonth.get(n) ?? 0) + spend);
    if (n === end) m.count += 1;
    merchants.set(label, m);
    if (n === end) {
      charges.push({
        id: r.id,
        postedOn: r.postedOn.toISOString().slice(0, 10),
        merchant: label,
        account: r.account.nickname || displayAccountName(r.account.name),
        cents: spend,
      });
    }
  }

  const prior = [end - 3, end - 2, end - 1];
  return {
    id: categoryId,
    name,
    year,
    month,
    months: [...totals].map(([n, cents]) => ({ ...fromYm(n), cents })),
    merchants: [...merchants.values()]
      .map((m) => ({
        merchant: m.merchant,
        cents: m.byMonth.get(end) ?? 0,
        count: m.count,
        averageCents: Math.round(prior.reduce((s, n) => s + (m.byMonth.get(n) ?? 0), 0) / prior.length),
      }))
      .filter((m) => m.cents !== 0 || m.averageCents > 0)
      .sort((a, b) => b.cents - a.cents || b.averageCents - a.averageCents)
      .slice(0, 15),
    charges,
  };
}
