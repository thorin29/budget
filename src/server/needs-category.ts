/**
 * Charges from the last 60 days that still need a category, for Review: money out on an account
 * that isn't hidden, not a transfer, not a bill payment and not split. Pending charges wait until
 * they post (their description can still change).
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { isPeerPayment } from "@/lib/category-guess";
import { feedLabel } from "./bank/accounts";

export interface NeedsCategoryRow {
  id: string;
  postedOn: string;
  merchant: string;
  accountName: string;
  amountCents: number;
  peer: boolean;
}

export async function needsCategory(today = new Date()): Promise<NeedsCategoryRow[]> {
  const since = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 60));
  const rows = (await prisma.bankTransaction.findMany({
    where: { categoryId: null, kind: "NORMAL", pending: false, amount: { lt: 0 }, postedOn: { gte: since }, account: { hidden: false }, actual: null, splits: { none: {} } },
    orderBy: [{ postedOn: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: { id: true, postedOn: true, merchant: true, amount: true, account: { select: { name: true, nickname: true } } },
  })) as Array<{ id: string; postedOn: Date; merchant: string; amount: { toString(): string }; account: { name: string; nickname: string | null } }>;
  return rows.map((r) => ({ id: r.id, postedOn: r.postedOn.toISOString().slice(0, 10), merchant: r.merchant, accountName: feedLabel(r.account), amountCents: toCents(r.amount), peer: isPeerPayment(r.merchant) }));
}
