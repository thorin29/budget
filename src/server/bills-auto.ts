/**
 * Bills that take care of themselves. Runs after each bank sync, after a
 * history file is imported, and at start:
 *
 *  1. Ties hand-recorded payments to the bank charge that was them, and
 *     remembers the merchant for the bill. Nothing new is recorded.
 *  2. Moves each bill's due day to when it actually posts, unless the person
 *     set the day themselves.
 *  3. Records a payment on its own when the charge comes from a merchant
 *     already tied to the bill, around the due day, in the usual amount range
 *     (bills like utilities vary); or when it's the bill's amount to the cent
 *     (at least $100), which also ties the merchant to the bill. Undo is on the Review page; a charge from a
 *     merchant it doesn't know yet still waits there for a Confirm.
 *  4. Card-payment bills: payments reaching the card are recorded for the
 *     month they pay, whatever the amount (src/server/card-bills.ts).
 *  5. Earlier months catch up: a year back, the sure matches only (recordPastMonths).
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { merchantKey } from "@/lib/field-crypto";
import { SPENDING_TYPES, type AccountType } from "@/lib/account-type";
import { knownMatch, learnedDueDay, pairRecorded, shouldMoveDueDay } from "@/lib/bill-history";
import { paydayNumbersFromNames } from "@/lib/pay-detect";
import type { MatchTxn } from "@/lib/bill-match";
import { recordActual, clearActual } from "./month";
import { dismissMatch, getReview, linkActual } from "./review";
import { applyCategories } from "./categorize";
import { NotFoundError } from "./errors";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface AutomationResult {
  linked: number;
  dueDaysMoved: number;
  recorded: number;
  cardsLinked: number;
  cardPayments: number;
}

/** 1. Hand-recorded payments meet their bank charges. */
export async function linkRecordedPayments(): Promise<number> {
  const since = new Date(Date.now() - 800 * DAY);
  const entries = (await prisma.actualEntry.findMany({
    where: { bankTransactionId: null, year: { gte: since.getUTCFullYear() } },
    select: { id: true, lineItemId: true, year: true, month: true, amount: true, paidOn: true, lineItem: { select: { kind: true, dueDay: true, name: true } } },
  })) as Array<{ id: string; lineItemId: string; year: number; month: number; amount: { toString(): string }; paidOn: Date | null; lineItem: { kind: string; dueDay: number | null; name: string } }>;
  if (!entries.length) return 0;

  const txns = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: since }, pending: false, kind: { not: "IGNORED" }, actual: { is: null }, account: { hidden: false } },
    select: { id: true, postedOn: true, amount: true, merchant: true, description: true, account: { select: { type: true } } },
  })) as Array<{ id: string; postedOn: Date; amount: { toString(): string }; merchant: string; description: string; account: { type: AccountType } }>;
  const merchantOf = new Map(txns.map((t) => [t.id, t.merchant]));
  const usable: MatchTxn[] = txns
    .map((t) => ({ t, cents: toCents(t.amount) }))
    .filter(({ t, cents }) => SPENDING_TYPES.includes(t.account.type) || (cents > 0 && t.account.type === "SAVINGS"))
    .map(({ t, cents }) => ({ id: t.id, postedOn: iso(t.postedOn), amountCents: cents, merchant: t.merchant, description: t.description, merchantKey: "" }));

  const pairs = pairRecorded(
    entries.map((e) => ({
      actualId: e.id, lineItemId: e.lineItemId, year: e.year, month: e.month, income: e.lineItem.kind === "INCOME",
      amountCents: toCents(e.amount), paidOn: e.paidOn ? iso(e.paidOn) : null, dueDay: e.lineItem.dueDay, name: e.lineItem.name,
    })),
    usable,
  );
  for (const p of pairs) {
    await prisma.actualEntry.update({ where: { id: p.actualId }, data: { bankTransactionId: p.txnId } });
    const key = merchantKey(merchantOf.get(p.txnId) ?? "");
    await prisma.billRule.upsert({ where: { lineItemId_merchantKey: { lineItemId: p.lineItemId, merchantKey: key } }, create: { lineItemId: p.lineItemId, merchantKey: key }, update: {} });
  }
  if (pairs.length) await applyCategories(pairs.map((p) => p.txnId));
  return pairs.length;
}

/** 2. Due days follow when bills actually post. */
export async function learnDueDays(): Promise<number> {
  const items = (await prisma.lineItem.findMany({
    where: { active: true, dueDayLocked: false, kind: { not: "INCOME" } },
    select: { id: true, dueDay: true },
  })) as Array<{ id: string; dueDay: number | null }>;
  if (!items.length) return 0;
  const linked = (await prisma.actualEntry.findMany({
    where: { lineItemId: { in: items.map((i) => i.id) }, bankTransactionId: { not: null }, bankTransaction: { postedOn: { gte: new Date(Date.now() - 200 * DAY) } } },
    select: { lineItemId: true, bankTransaction: { select: { postedOn: true } } },
  })) as Array<{ lineItemId: string; bankTransaction: { postedOn: Date } | null }>;
  const posted = new Map<string, string[]>();
  for (const l of linked) if (l.bankTransaction) posted.set(l.lineItemId, [...(posted.get(l.lineItemId) ?? []), iso(l.bankTransaction.postedOn)]);
  let moved = 0;
  for (const item of items) {
    const learned = learnedDueDay(posted.get(item.id) ?? []);
    if (!shouldMoveDueDay(item.dueDay, learned)) continue;
    await prisma.lineItem.update({ where: { id: item.id }, data: { dueDay: learned, dueDayPrevious: item.dueDay, dueDayChangedAt: new Date() } });
    moved += 1;
  }
  return moved;
}

/** 3. Exact matches are recorded on their own. */
export async function recordExactMatches(): Promise<number> {
  const { looksPaid } = await getReview();
  const { isPeerPayment } = await import("@/lib/category-guess");
  const sure = (s: (typeof looksPaid)[number]) =>
    s.known || (s.kind !== "INCOME" && knownMatch({ knownMerchant: false, amountCents: s.amountCents, budgetedCents: s.budgetedCents, peerPayment: isPeerPayment(s.merchant) }));
  const known = looksPaid.filter(sure);
  if (!known.length) return 0;
  const items = new Map(
    ((await prisma.lineItem.findMany({ where: { id: { in: known.map((k) => k.lineItemId) } }, select: { id: true, autoRecord: true } })) as Array<{ id: string; autoRecord: boolean }>).map((i) => [i.id, i]),
  );
  let recorded = 0;
  for (const s of known) {
    if (!items.get(s.lineItemId)?.autoRecord) continue;
    await recordActual(s.lineItemId, s.year, s.month, s.amountCents, undefined, new Date(`${s.postedOn}T00:00:00Z`));
    await prisma.actualEntry.update({ where: { lineItemId_year_month: { lineItemId: s.lineItemId, year: s.year, month: s.month } }, data: { source: "auto" } });
    await linkActual(s.lineItemId, s.year, s.month, s.txnId, s.merchant);
    recorded += 1;
  }
  return recorded;
}

/**
 * Income named like "Pay", "Pay 2", "Pay 3" follows the pay calendar's 1st,
 * 2nd and 3rd payday, once there's a calendar paid more than monthly. Only
 * items nobody has set are touched; the line item form changes it.
 */
export async function assignPaydayNumbers(): Promise<number> {
  const calendars = await prisma.paySchedule.count({ where: { frequency: { not: "MONTHLY" } } });
  if (!calendars) return 0;
  const items = (await prisma.lineItem.findMany({ where: { kind: "INCOME", active: true }, select: { id: true, name: true, paydayNumber: true } })) as Array<{ id: string; name: string; paydayNumber: number | null }>;
  const numbers = paydayNumbersFromNames(items);
  let set = 0;
  for (const item of items) {
    const n = numbers.get(item.id);
    if (n === undefined || item.paydayNumber !== null) continue;
    await prisma.lineItem.update({ where: { id: item.id }, data: { paydayNumber: n } });
    set += 1;
  }
  return set;
}

/**
 * 5. Earlier months catch up. The review list and step 3 only look at this month and what's
 * carried from last month, so a bill from months back whose charge came in (or came in before
 * the bill was set up) stays "unpaid." For each month from a year back to two months ago,
 * oldest first, an unpaid bill is recorded from an unlinked charge when it's sure: the merchant
 * was confirmed for the bill before, the charge names the bill, or it's the bill's amount to the
 * cent (a same-category charge counts only at the exact amount). Charges are used once.
 */
export async function recordPastMonths(monthsBack = 12): Promise<number> {
  const { getMonthView } = await import("./month");
  const { suggestMatches } = await import("@/lib/bill-match");
  const now = new Date();
  const nowN = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const first = nowN - monthsBack;
  const lastN = nowN - 2;
  if (lastN < first) return 0;
  const from = new Date(Date.UTC(Math.floor(first / 12), first % 12, 1) - 20 * DAY);
  const [rows, rules, dismissals, cardItems] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { postedOn: { gte: from }, pending: false, kind: { not: "IGNORED" }, actual: { is: null }, account: { hidden: false } },
      select: { id: true, postedOn: true, amount: true, merchant: true, description: true, account: { select: { type: true } }, category: { select: { name: true, managedForOthers: true } } },
    }) as Promise<Array<{ id: string; postedOn: Date; amount: { toString(): string }; merchant: string; description: string; account: { type: AccountType }; category: { name: string; managedForOthers: boolean } | null }>>,
    prisma.billRule.findMany({ select: { lineItemId: true, merchantKey: true } }) as Promise<Array<{ lineItemId: string; merchantKey: string }>>,
    prisma.reviewDismissal.findMany({ where: { kind: "match" }, select: { key: true } }) as Promise<Array<{ key: string }>>,
    // Card payments, bills set not to record on their own, and retired bills (turned off in Bills
    // & income: an old imported row shouldn't keep collecting payments) are left alone.
    prisma.lineItem.findMany({ where: { OR: [{ paysCardId: { not: null } }, { autoRecord: false }, { active: false }] }, select: { id: true } }) as Promise<Array<{ id: string }>>,
  ]);
  const ruleMap = new Map<string, Set<string>>();
  for (const r of rules) ruleMap.set(r.merchantKey, new Set([...(ruleMap.get(r.merchantKey) ?? []), r.lineItemId]));
  const dismissed = new Set(dismissals.map((d) => d.key));
  const skip = new Set(cardItems.map((i) => i.id));
  const used = new Set<string>();
  const txns: MatchTxn[] = rows
    .filter((t) => !t.category?.managedForOthers)
    .map((t) => ({ t, cents: toCents(t.amount) }))
    .filter(({ t, cents }) => SPENDING_TYPES.includes(t.account.type) || (cents > 0 && t.account.type === "SAVINGS"))
    .map(({ t, cents }) => ({ id: t.id, postedOn: iso(t.postedOn), amountCents: cents, merchant: t.merchant, description: t.description, merchantKey: merchantKey(t.merchant), category: t.category?.name ?? null }));
  let recorded = 0;
  for (let n = first; n <= lastN; n++) {
    const [y, m] = [Math.floor(n / 12), (n % 12) + 1];
    const view = await getMonthView(y, m);
    const open = [...view.halves[0].entries, ...view.halves[1].entries, ...view.surplusItems, ...view.income].filter(
      (e) => e.actualCents === null && !e.skipped && e.budgetedCents > 0 && !skip.has(e.lineItemId),
    );
    if (!open.length) continue;
    const bills = open.map((b) => ({ lineItemId: b.lineItemId, year: b.year, month: b.month, name: b.name, kind: b.kind, dueDay: b.dueDay, budgetedCents: b.budgetedCents, category: b.categoryName }));
    const free = txns.filter((t) => !used.has(t.id));
    for (const s of suggestMatches(bills, free, ruleMap, dismissed)) {
      const t = free.find((x) => x.id === s.txnId)!;
      const bill = bills.find((b) => b.lineItemId === s.lineItemId)!;
      const exact = Math.abs(Math.abs(t.amountCents) - bill.budgetedCents) <= 50;
      if (s.reason === "category" && !exact) continue;
      await recordActual(s.lineItemId, s.year, s.month, Math.abs(t.amountCents), undefined, new Date(`${t.postedOn}T00:00:00Z`));
      await prisma.actualEntry.update({ where: { lineItemId_year_month: { lineItemId: s.lineItemId, year: s.year, month: s.month } }, data: { source: "auto" } });
      await linkActual(s.lineItemId, s.year, s.month, t.id, t.merchant);
      used.add(t.id);
      recorded += 1;
    }
  }
  return recorded;
}

export async function runBillAutomation(): Promise<AutomationResult> {
  await assignPaydayNumbers();
  const linked = await linkRecordedPayments();
  const { learnCardLinks, recordCardPayments } = await import("./card-bills");
  const cardsLinked = await learnCardLinks();
  const dueDaysMoved = await learnDueDays();
  const recorded = (await recordExactMatches()) + (await recordPastMonths());
  const cardPayments = await recordCardPayments();
  const { closePaidOffBills } = await import("./payoff");
  await closePaidOffBills();
  return { linked, dueDaysMoved, recorded, cardsLinked, cardPayments };
}

// ---------------------------------------------------------------- what it did, and undoing it

export interface AutoRecorded {
  lineItemId: string;
  year: number;
  month: number;
  name: string;
  amountCents: number;
  paidOn: string | null;
  merchant: string | null;
  /** The card or account the charge came from. */
  account?: string | null;
}

export interface DueDayMoved {
  lineItemId: string;
  name: string;
  from: number | null;
  to: number | null;
}

export async function recentAutomation(): Promise<{ recorded: AutoRecorded[]; moved: DueDayMoved[] }> {
  const recorded = (await prisma.actualEntry.findMany({
    where: { source: "auto", createdAt: { gte: new Date(Date.now() - 10 * DAY) } },
    orderBy: { createdAt: "desc" },
    select: { lineItemId: true, year: true, month: true, amount: true, paidOn: true, lineItem: { select: { name: true } }, bankTransaction: { select: { merchant: true, account: { select: { name: true, nickname: true } } } } },
  })) as Array<{ lineItemId: string; year: number; month: number; amount: { toString(): string }; paidOn: Date | null; lineItem: { name: string }; bankTransaction: { merchant: string; account: { name: string; nickname: string | null } } | null }>;
  const moved = (await prisma.lineItem.findMany({
    where: { dueDayChangedAt: { gte: new Date(Date.now() - 30 * DAY) } },
    orderBy: { dueDayChangedAt: "desc" },
    select: { id: true, name: true, dueDay: true, dueDayPrevious: true },
  })) as Array<{ id: string; name: string; dueDay: number | null; dueDayPrevious: number | null }>;
  return {
    recorded: recorded.map((r) => ({
      lineItemId: r.lineItemId, year: r.year, month: r.month, name: r.lineItem.name, amountCents: toCents(r.amount),
      paidOn: r.paidOn ? iso(r.paidOn) : null, merchant: r.bankTransaction?.merchant ?? null,
      account: r.bankTransaction ? r.bankTransaction.account.nickname || r.bankTransaction.account.name : null,
    })),
    moved: moved.map((m) => ({ lineItemId: m.id, name: m.name, from: m.dueDayPrevious, to: m.dueDay })),
  };
}

/**
 * Removes a payment recorded on its own, and doesn't offer that charge for the bill again. The
 * charge stays in Transactions as ordinary spending: in `categoryId` when given (kept as the
 * person's choice), otherwise in the category its merchant would get anyway (not the bill's).
 */
export async function undoAutoRecord(lineItemId: string, year: number, month: number, categoryId?: string | null): Promise<void> {
  const entry = (await prisma.actualEntry.findUnique({
    where: { lineItemId_year_month: { lineItemId, year, month } },
    select: { source: true, bankTransactionId: true },
  })) as { source: string; bankTransactionId: string | null } | null;
  if (!entry || entry.source !== "auto") throw new NotFoundError("Automatic payment");
  if (categoryId) {
    const found = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!found) throw new NotFoundError("Category");
  }
  await clearActual(lineItemId, year, month);
  const txn = entry.bankTransactionId;
  if (!txn) return;
  await dismissMatch(lineItemId, txn);
  if (categoryId) {
    await prisma.bankTransaction.update({ where: { id: txn }, data: { categoryId, categorySource: "person" } });
  } else {
    await prisma.bankTransaction.updateMany({ where: { id: txn, categorySource: "bill" }, data: { categorySource: "guess" } });
    await applyCategories([txn]);
  }
}

/** Puts a due day back and stops the bank from moving it again. */
export async function undoDueDay(lineItemId: string): Promise<void> {
  const item = (await prisma.lineItem.findUnique({ where: { id: lineItemId }, select: { dueDayPrevious: true, dueDayChangedAt: true } })) as { dueDayPrevious: number | null; dueDayChangedAt: Date | null } | null;
  if (!item || !item.dueDayChangedAt) throw new NotFoundError("Due day change");
  await prisma.lineItem.update({ where: { id: lineItemId }, data: { dueDay: item.dueDayPrevious, dueDayLocked: true, dueDayPrevious: null, dueDayChangedAt: null } });
}

/** Keeps a moved due day and clears the note. */
export async function keepDueDay(lineItemId: string): Promise<void> {
  await prisma.lineItem.update({ where: { id: lineItemId }, data: { dueDayPrevious: null, dueDayChangedAt: null } });
}

/**
 * Moves a payment to the month it was really for. When that month already has
 * a payment, the bank charge (if any) is tied to it and this one is removed,
 * so the charge can never count for the wrong month again.
 */
export async function moveActual(lineItemId: string, from: { year: number; month: number }, to: { year: number; month: number }): Promise<void> {
  if (from.year === to.year && from.month === to.month) return;
  if (to.month < 1 || to.month > 12) throw new NotFoundError("Month");
  const source = (await prisma.actualEntry.findUnique({
    where: { lineItemId_year_month: { lineItemId, year: from.year, month: from.month } },
    select: { id: true, bankTransactionId: true },
  })) as { id: string; bankTransactionId: string | null } | null;
  if (!source) throw new NotFoundError("Payment");
  const target = (await prisma.actualEntry.findUnique({
    where: { lineItemId_year_month: { lineItemId, year: to.year, month: to.month } },
    select: { id: true, bankTransactionId: true },
  })) as { id: string; bankTransactionId: string | null } | null;
  if (target) {
    await prisma.actualEntry.delete({ where: { id: source.id } });
    if (source.bankTransactionId && !target.bankTransactionId) {
      await prisma.actualEntry.update({ where: { id: target.id }, data: { bankTransactionId: source.bankTransactionId } });
    } else if (source.bankTransactionId) {
      // The other month already has its charge; this one must not come back for the bill.
      await dismissMatch(lineItemId, source.bankTransactionId);
    }
  } else {
    await prisma.actualEntry.update({ where: { id: source.id }, data: { year: to.year, month: to.month, source: "manual" } });
  }
}
