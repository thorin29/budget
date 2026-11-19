/**
 * "Add as a bill" on a charge: a monthly bill made from the charge and the
 * merchant's recent charges (their usual amount and day), tied to the
 * merchant so later charges are recorded for it, with this charge recorded
 * as this month's payment.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { merchantKey } from "@/lib/field-crypto";
import { isPeerPayment } from "@/lib/category-guess";
import { createLineItem } from "./line-items";
import { getSettings } from "./settings";
import { recordActual } from "./month";
import { linkActual } from "./review";
import { NotFoundError, ValidationError } from "./errors";

const DAY = 86_400_000;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** The usual amount and day from a merchant's charges (newest first), at most the last six. */
export function usualCharge(charges: Array<{ day: number; cents: number }>): { cents: number; day: number } {
  const recent = charges.slice(0, 6);
  return { cents: median(recent.map((c) => c.cents)), day: Math.min(28, median(recent.map((c) => c.day))) };
}

export async function addChargeAsBill(txnId: string, name?: string): Promise<{ lineItemId: string; name: string }> {
  const txn = (await prisma.bankTransaction.findUnique({
    where: { id: txnId },
    select: { id: true, merchant: true, amount: true, postedOn: true, categoryId: true, actual: { select: { id: true } }, account: { select: { type: true, linkedAccountId: true } } },
  })) as {
    id: string;
    merchant: string;
    amount: { toString(): string };
    postedOn: Date;
    categoryId: string | null;
    actual: { id: string } | null;
    account: { type: string; linkedAccountId: string | null };
  } | null;
  if (!txn) throw new NotFoundError("Transaction");
  if (toCents(txn.amount) >= 0) throw new ValidationError({ transactionId: ["Only money going out can be a bill"] });
  if (txn.actual) throw new ValidationError({ transactionId: ["That charge is already a bill's payment"] });
  if (isPeerPayment(txn.merchant)) throw new ValidationError({ transactionId: ["Payment apps carry unrelated payments, so add that bill on Bills & income instead"] });

  // The merchant's recent charges give the usual amount and day.
  const key = merchantKey(txn.merchant);
  // A merchant already tied to a bill gets linked to it, not a second bill.
  const already = (await prisma.billRule.findFirst({ where: { merchantKey: key, lineItem: { active: true } }, select: { lineItem: { select: { name: true } } } })) as { lineItem: { name: string } } | null;
  if (already) throw new ValidationError({ transactionId: [`${already.lineItem.name} is already the bill for this merchant: use Link to a bill`] });
  const recent = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: new Date(Date.now() - 200 * DAY) }, kind: "NORMAL", amount: { lt: 0 } },
    select: { merchant: true, amount: true, postedOn: true },
    orderBy: { postedOn: "desc" },
  })) as Array<{ merchant: string; amount: { toString(): string }; postedOn: Date }>;
  const same = recent.filter((r) => merchantKey(r.merchant) === key).map((r) => ({ day: r.postedOn.getUTCDate(), cents: -toCents(r.amount) }));
  const usual = usualCharge(same.length ? same : [{ day: txn.postedOn.getUTCDate(), cents: -toCents(txn.amount) }]);

  const { billsAccountId } = await getSettings();
  const onCard = txn.account.type === "CREDIT_CARD";
  const item = await createLineItem({
    name: (name?.trim() || txn.merchant).slice(0, 80),
    kind: "BILL",
    plannedAmountCents: usual.cents,
    dueDay: usual.day,
    categoryId: txn.categoryId,
    paidFromId: onCard ? billsAccountId : (txn.account.linkedAccountId ?? billsAccountId),
    chargedToId: onCard ? txn.account.linkedAccountId : null,
    paysCard: "none",
    scheduleKind: "MONTHLY",
    // Starts with this charge's month, so earlier months don't show as unpaid.
    startYear: txn.postedOn.getUTCFullYear(),
    startMonth: txn.postedOn.getUTCMonth() + 1,
  });

  // This charge is the bill's payment for its month.
  const year = txn.postedOn.getUTCFullYear();
  const month = txn.postedOn.getUTCMonth() + 1;
  const existing = await prisma.actualEntry.findUnique({ where: { lineItemId_year_month: { lineItemId: item.id, year, month } }, select: { id: true } });
  if (!existing) await recordActual(item.id, year, month, -toCents(txn.amount), undefined, txn.postedOn);
  await linkActual(item.id, year, month, txn.id, txn.merchant);
  return { lineItemId: item.id, name: item.name };
}
