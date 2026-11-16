/**
 * The review list: things the bank feed noticed that need a person.
 *
 *  - "Looks paid": a transaction that probably paid an unpaid bill (or brought
 *    in expected income). Confirming records the payment with the bank's
 *    amount and date, links the two, and remembers the merchant for that bill.
 *  - "Repeats every month": a charge that keeps coming back but isn't a bill.
 *    Adding it creates a line item and remembers the merchant.
 *
 * Nothing is recorded without the person confirming it.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { merchantKey } from "@/lib/field-crypto";
import { findRepeats, suggestMatches, tokens, type MatchBill, type MatchTxn } from "@/lib/bill-match";
import { SPENDING_TYPES, displayAccountName, type AccountType } from "@/lib/account-type";
import { getMonthView, recordActual, type MonthEntry } from "./month";
import { createLineItem } from "./line-items";
import { getSettings } from "./settings";
import { applyCategories } from "./categorize";
import { NotFoundError, ValidationError } from "./errors";

const DAY = 86_400_000;

export interface LooksPaid {
  lineItemId: string;
  year: number;
  month: number;
  billName: string;
  kind: MonthEntry["kind"];
  budgetedCents: number;
  dueDay: number | null;
  txnId: string;
  amountCents: number;
  postedOn: string;
  merchant: string;
  description: string;
  account: string;
  confidence: "high" | "medium";
  reason: string;
  /** Unpaid months of this bill, oldest first; the payment can be recorded to any of them. */
  openMonths: Array<{ year: number; month: number }>;
}

export interface RepeatCharge {
  merchantKey: string;
  merchant: string;
  typicalCents: number;
  typicalDay: number;
  months: number;
  lastOn: string;
  account: string;
  fromChecking: boolean;
}

export interface Review {
  looksPaid: LooksPaid[];
  repeats: RepeatCharge[];
  count: number;
}

type TxnRow = {
  id: string;
  postedOn: Date;
  amount: { toString(): string };
  merchant: string;
  description: string;
  account: { name: string; type: AccountType; hidden: boolean };
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function localYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit" }).formatToParts(now);
  return { year: Number(parts.find((p) => p.type === "year")?.value), month: Number(parts.find((p) => p.type === "month")?.value) };
}

async function recentTransactions(days: number): Promise<TxnRow[]> {
  return (await prisma.bankTransaction.findMany({
    where: {
      postedOn: { gte: new Date(Date.now() - days * DAY) },
      pending: false,
      kind: { not: "IGNORED" },
      actual: { is: null },
      account: { hidden: false },
    },
    select: { id: true, postedOn: true, amount: true, merchant: true, description: true, account: { select: { name: true, type: true, hidden: true } } },
  })) as TxnRow[];
}

/** Unpaid bills and expected income for this month, plus anything carried. */
async function openBills(): Promise<Array<MonthEntry>> {
  const { year, month } = localYearMonth();
  const view = await getMonthView(year, month);
  const all = [...view.carried, ...view.halves[0].entries, ...view.halves[1].entries, ...view.surplusItems, ...view.income];
  return all.filter((e) => e.actualCents === null && !e.skipped && e.budgetedCents > 0);
}

export async function getReview(): Promise<Review> {
  const [bills, txns, rules, dismissals, lineItems] = await Promise.all([
    openBills(),
    recentTransactions(120),
    prisma.billRule.findMany({ select: { lineItemId: true, merchantKey: true } }),
    prisma.reviewDismissal.findMany({ select: { kind: true, key: true } }),
    prisma.lineItem.findMany({ where: { active: true }, select: { name: true } }),
  ]);

  const ruleMap = new Map<string, Set<string>>();
  for (const r of rules as Array<{ lineItemId: string; merchantKey: string }>) {
    ruleMap.set(r.merchantKey, new Set([...(ruleMap.get(r.merchantKey) ?? []), r.lineItemId]));
  }
  const dismissed = new Set((dismissals as Array<{ kind: string; key: string }>).filter((d) => d.kind === "match").map((d) => d.key));
  const dismissedRepeats = new Set((dismissals as Array<{ kind: string; key: string }>).filter((d) => d.kind === "repeat").map((d) => d.key));

  const keyed = txns.map((t) => ({ row: t, key: merchantKey(t.merchant), cents: toCents(t.amount) }));
  const byId = new Map(keyed.map((k) => [k.row.id, k]));
  // Bills are paid from checking or a card; income lands in checking or savings.
  const matchable: MatchTxn[] = keyed
    .filter((k) => SPENDING_TYPES.includes(k.row.account.type) || (k.cents > 0 && k.row.account.type === "SAVINGS"))
    .filter((k) => Date.now() - k.row.postedOn.getTime() < 75 * DAY)
    .map((k) => ({ id: k.row.id, postedOn: iso(k.row.postedOn), amountCents: k.cents, merchant: k.row.merchant, description: k.row.description, merchantKey: k.key }));

  const matchBills: MatchBill[] = bills.map((b) => ({
    lineItemId: b.lineItemId, year: b.year, month: b.month, name: b.name, kind: b.kind, dueDay: b.dueDay, budgetedCents: b.budgetedCents,
    overdue: b.carriedFrom !== null,
  }));
  // Every open month per bill, so a confirmed payment can go to another one.
  const openMonths = new Map<string, Array<{ year: number; month: number }>>();
  for (const b of bills) openMonths.set(b.lineItemId, [...(openMonths.get(b.lineItemId) ?? []), { year: b.year, month: b.month }]);
  const billByKey = new Map(bills.map((b) => [`${b.lineItemId}:${b.year}:${b.month}`, b]));

  const looksPaid: LooksPaid[] = suggestMatches(matchBills, matchable, ruleMap, dismissed).map((s) => {
    const b = billByKey.get(`${s.lineItemId}:${s.year}:${s.month}`) as MonthEntry;
    const t = byId.get(s.txnId)!;
    return {
      lineItemId: s.lineItemId, year: s.year, month: s.month, billName: b.name, kind: b.kind, budgetedCents: b.budgetedCents, dueDay: b.dueDay,
      txnId: s.txnId, amountCents: Math.abs(t.cents), postedOn: iso(t.row.postedOn), merchant: t.row.merchant, description: t.row.description,
      account: displayAccountName(t.row.account.name), confidence: s.confidence,
      reason: s.reason === "confirmed before" ? "Same place as before" : s.reason === "name" ? "Name matches" : "Exact amount",
      openMonths: (openMonths.get(s.lineItemId) ?? []).sort((x, y) => x.year * 12 + x.month - (y.year * 12 + y.month)),
    };
  });

  // Repeats: spending accounts, ordinary charges, not already a bill's merchant, not turned down, not named like an existing bill.
  const billWords = new Set(lineItems.flatMap((l: { name: string }) => [...tokens(l.name)]));
  const repeatRows = keyed.filter((k) => SPENDING_TYPES.includes(k.row.account.type) && !ruleMap.has(k.key) && !dismissedRepeats.has(k.key));
  const plain = await prisma.bankTransaction.findMany({
    where: { id: { in: repeatRows.map((k) => k.row.id) }, kind: "NORMAL" },
    select: { id: true },
  });
  const normalIds = new Set((plain as Array<{ id: string }>).map((p) => p.id));
  const accountOf = new Map(repeatRows.map((k) => [k.key, k.row.account]));
  const repeats: RepeatCharge[] = findRepeats(
    repeatRows.filter((k) => normalIds.has(k.row.id)).map((k) => ({ postedOn: iso(k.row.postedOn), amountCents: k.cents, merchant: k.row.merchant, merchantKey: k.key })),
  )
    .filter((r) => ![...tokens(r.merchant)].some((w) => billWords.has(w)))
    .map((r) => {
      const account = accountOf.get(r.merchantKey)!;
      return { ...r, account: displayAccountName(account.name), fromChecking: account.type === "CHECKING" };
    });

  return { looksPaid, repeats, count: looksPaid.length + repeats.length };
}

/** Records the payment from the bank's transaction, links them, and learns the merchant. */
export async function confirmMatch(input: {
  lineItemId: string;
  year: number;
  month: number;
  txnId: string;
  amountCents: number;
  paidOn: Date;
  userId: string;
}): Promise<void> {
  const txn = (await prisma.bankTransaction.findUnique({ where: { id: input.txnId }, select: { id: true, merchant: true, actual: { select: { id: true } } } })) as {
    id: string;
    merchant: string;
    actual: { id: string } | null;
  } | null;
  if (!txn) throw new NotFoundError("Transaction");
  if (txn.actual) throw new ValidationError({ txnId: ["That transaction is already recorded as a payment"] });
  await recordActual(input.lineItemId, input.year, input.month, input.amountCents, undefined, input.paidOn, input.userId);
  await linkActual(input.lineItemId, input.year, input.month, txn.id, txn.merchant);
}

/** Links an already-recorded payment to its transaction and remembers the merchant for the bill. */
export async function linkActual(lineItemId: string, year: number, month: number, txnId: string, merchant?: string): Promise<void> {
  const name = merchant ?? ((await prisma.bankTransaction.findUnique({ where: { id: txnId }, select: { merchant: true } })) as { merchant: string } | null)?.merchant;
  if (!name) throw new NotFoundError("Transaction");
  await prisma.actualEntry.updateMany({ where: { bankTransactionId: txnId }, data: { bankTransactionId: null } });
  await prisma.actualEntry.update({ where: { lineItemId_year_month: { lineItemId, year, month } }, data: { bankTransactionId: txnId } });
  const key = merchantKey(name);
  await prisma.billRule.upsert({ where: { lineItemId_merchantKey: { lineItemId, merchantKey: key } }, create: { lineItemId, merchantKey: key }, update: {} });
  await applyCategories([txnId]);
}

export async function dismissMatch(lineItemId: string, txnId: string): Promise<void> {
  const key = `${lineItemId}:${txnId}`;
  await prisma.reviewDismissal.upsert({ where: { kind_key: { kind: "match", key } }, create: { kind: "match", key }, update: {} });
}

export async function dismissRepeat(key: string): Promise<void> {
  if (!/^[0-9a-f]{32}$/.test(key)) throw new ValidationError({ key: ["Unknown charge"] });
  await prisma.reviewDismissal.upsert({ where: { kind_key: { kind: "repeat", key } }, create: { kind: "repeat", key }, update: {} });
}

/** Turns a repeating charge into a monthly bill and remembers its merchant. */
export async function addRepeatAsBill(key: string): Promise<{ lineItemId: string; name: string }> {
  const review = await getReview();
  const repeat = review.repeats.find((r) => r.merchantKey === key);
  if (!repeat) throw new NotFoundError("Repeating charge");
  const { billsAccountId } = await getSettings();
  const item = await createLineItem({
    name: repeat.merchant.slice(0, 80),
    kind: "BILL",
    plannedAmountCents: repeat.typicalCents,
    dueDay: Math.min(repeat.typicalDay, 28),
    paidFromId: repeat.fromChecking ? billsAccountId : null,
    scheduleKind: "MONTHLY",
  });
  await prisma.billRule.upsert({
    where: { lineItemId_merchantKey: { lineItemId: item.id, merchantKey: key } },
    create: { lineItemId: item.id, merchantKey: key },
    update: {},
  });
  return { lineItemId: item.id, name: item.name };
}

/** Suggestions for one month's rows, keyed by lineItemId:year:month, for the month page. */
export async function looksPaidByRow(): Promise<Map<string, LooksPaid>> {
  const { looksPaid } = await getReview();
  return new Map(looksPaid.map((l) => [`${l.lineItemId}:${l.year}:${l.month}`, l]));
}
