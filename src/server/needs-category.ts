/**
 * Charges from the last 60 days that still need a category, for Review: money out of checking or a
 * card (not an investment or loan account, which aren't spending), not a transfer, not a bill
 * payment, not split, and not a charge that looks like a bill's payment waiting to be matched.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { isPeerPayment } from "@/lib/category-guess";
import { SPENDING_TYPES } from "@/lib/account-type";
import { billLookalike } from "@/lib/bill-lookalike";
import { feedLabel } from "./bank/accounts";

export interface NeedsCategoryRow {
  id: string;
  postedOn: string;
  merchant: string;
  accountName: string;
  amountCents: number;
  pending: boolean;
  peer: boolean;
}

export async function needsCategory(today = new Date()): Promise<NeedsCategoryRow[]> {
  const day = (back: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back));
  const [rows, paid] = (await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        categoryId: null, kind: "NORMAL", amount: { lt: 0 }, postedOn: { gte: day(60) },
        account: { hidden: false, type: { in: [...SPENDING_TYPES] } }, actual: null, splits: { none: {} },
      },
      orderBy: [{ postedOn: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: { id: true, postedOn: true, merchant: true, amount: true, pending: true, account: { select: { name: true, nickname: true } } },
    }),
    prisma.bankTransaction.findMany({ where: { actual: { isNot: null }, postedOn: { gte: day(400) } }, select: { merchant: true, amount: true } }),
  ])) as [
    Array<{ id: string; postedOn: Date; merchant: string; amount: { toString(): string }; pending: boolean; account: { name: string; nickname: string | null } }>,
    Array<{ merchant: string; amount: { toString(): string } }>,
  ];
  const looksLikeBill = billLookalike(paid.map((p) => ({ merchant: p.merchant, cents: Math.abs(toCents(p.amount)) })));
  return rows
    .filter((r) => !looksLikeBill({ merchant: r.merchant, cents: toCents(r.amount), categoryId: null, linked: false }))
    .map((r) => ({ id: r.id, postedOn: r.postedOn.toISOString().slice(0, 10), merchant: r.merchant, accountName: feedLabel(r.account), amountCents: toCents(r.amount), pending: r.pending, peer: isPeerPayment(r.merchant) }));
}
