/**
 * Card-payment bills pay themselves off the bank feed. Runs with the rest of
 * the bill automation:
 *
 *  1. Works out which card each card-payment bill pays (from payments recorded
 *     by hand that match payments reaching a card, else from a shared name),
 *     unless the person picked on the bill's form.
 *  2. Records each payment that reaches a linked card for the month it pays,
 *     whatever the amount, tied to the checking side when the transfer was
 *     paired. Undo is on the Review page, as for other automatic payments.
 *     A balance transfer that pays a statement is recorded as $0 from checking.
 *  3. Moves a payment recorded for the wrong month to the statement it paid:
 *     a payment the day after a statement closes pays that statement (due next
 *     month), not the one due this month.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { cardByName, cardsFromHistory, paymentMonth } from "@/lib/card-links";
import { recordActual } from "./month";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** A credit on a card that reads like a payment rather than a refund. */
const PAYMENT_WORDS = /\b(payment|pymt|pmt|thank you|autopay|auto pay|epay|online pmt)\b/i;

type Card = { id: string; name: string; bankAccount: { id: string; name: string; nickname: string | null; institution: string | null; statementCloseDay: number | null; paymentDueDay: number | null } | null };

async function cards(): Promise<Card[]> {
  return (await prisma.account.findMany({
    where: { kind: "CREDIT_CARD", active: true },
    select: {
      id: true, name: true,
      bankAccount: { select: { id: true, name: true, nickname: true, institution: true, statementCloseDay: true, paymentDueDay: true } },
    },
  })) as Card[];
}

/** Payments that reached each card's feed account since `since`. */
async function cardCredits(bankIds: string[], since: Date) {
  if (!bankIds.length) return [];
  const rows = (await prisma.bankTransaction.findMany({
    where: { accountId: { in: bankIds }, postedOn: { gte: since }, pending: false, amount: { gt: 0 }, kind: { not: "IGNORED" } },
    select: { id: true, accountId: true, postedOn: true, amount: true, kind: true, description: true, merchant: true, transferOfId: true },
  })) as Array<{ id: string; accountId: string; postedOn: Date; amount: { toString(): string }; kind: string; description: string; merchant: string; transferOfId: string | null }>;
  return rows.filter((r) => r.kind === "TRANSFER" || PAYMENT_WORDS.test(`${r.description} ${r.merchant}`));
}

/** 1. Which card each card-payment bill pays. */
export async function learnCardLinks(): Promise<number> {
  const items = (await prisma.lineItem.findMany({
    where: { active: true, kind: { not: "INCOME" }, paysCardLocked: false, paysCardId: null },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  if (!items.length) return 0;
  const all = (await cards()).filter((c) => c.bankAccount);
  if (!all.length) return 0;
  const byBank = new Map(all.map((c) => [c.bankAccount!.id, c.id]));

  const since = new Date(Date.now() - 400 * DAY);
  const recorded = (await prisma.actualEntry.findMany({
    where: { lineItemId: { in: items.map((i) => i.id) }, paidOn: { gte: since } },
    select: { lineItemId: true, paidOn: true, amount: true },
  })) as Array<{ lineItemId: string; paidOn: Date | null; amount: { toString(): string } }>;
  const credits = await cardCredits([...byBank.keys()], since);
  const fromHistory = cardsFromHistory(
    recorded.filter((r) => r.paidOn).map((r) => ({ lineItemId: r.lineItemId, paidOn: iso(r.paidOn!), cents: toCents(r.amount) })),
    credits.map((c) => ({ cardId: byBank.get(c.accountId)!, postedOn: iso(c.postedOn), cents: toCents(c.amount) })),
  );
  // Names only for bills with no payment history to say otherwise.
  const withHistory = new Set(recorded.map((r) => r.lineItemId));
  const named = all.map((c) => ({
    id: c.id,
    names: [c.bankAccount!.nickname ?? "", c.bankAccount!.name, c.bankAccount!.institution ?? ""],
  }));

  let linked = 0;
  for (const item of items) {
    const card = fromHistory.get(item.id) ?? (withHistory.has(item.id) ? null : cardByName(item.name, named));
    if (!card) continue;
    // One bill per card: the first to claim it keeps it.
    if (await prisma.lineItem.findFirst({ where: { paysCardId: card, active: true }, select: { id: true } })) continue;
    await prisma.lineItem.update({ where: { id: item.id }, data: { paysCardId: card } });
    linked += 1;
  }
  return linked;
}

/** 2. Payments reaching a linked card are recorded for the month they pay. */
export async function recordCardPayments(): Promise<number> {
  const items = (await prisma.lineItem.findMany({
    where: { active: true, kind: { not: "INCOME" }, autoRecord: true, paysCardId: { not: null } },
    select: { id: true, dueDay: true, paysCard: { select: { bankAccount: { select: { id: true, statementCloseDay: true, paymentDueDay: true } } } } },
  })) as Array<{ id: string; dueDay: number | null; paysCard: { bankAccount: { id: string; statementCloseDay: number | null; paymentDueDay: number | null } | null } | null }>;
  const linked = items.filter((i) => i.paysCard?.bankAccount);
  if (!linked.length) return 0;

  const since = new Date(Date.now() - 75 * DAY);
  const credits = await cardCredits(linked.map((i) => i.paysCard!.bankAccount!.id), since);
  if (!credits.length) return 0;
  // The checking side of each paired transfer, which is what the bills account saw.
  const partners = (await prisma.bankTransaction.findMany({
    where: { OR: [{ transferOfId: { in: credits.map((c) => c.id) } }, { id: { in: credits.map((c) => c.transferOfId).filter((x): x is string => !!x) } }] },
    select: { id: true, transferOfId: true },
  })) as Array<{ id: string; transferOfId: string | null }>;
  const partnerOf = new Map<string, string>();
  for (const p of partners) if (p.transferOfId) partnerOf.set(p.transferOfId, p.id);
  for (const c of credits) if (c.transferOfId) partnerOf.set(c.id, c.transferOfId);
  // Credits whose other side is on a credit card: balance transfers.
  const partnerIds = [...new Set(credits.map((c) => partnerOf.get(c.id)).filter((x): x is string => !!x))];
  const cardSides = new Set(
    ((await prisma.bankTransaction.findMany({ where: { id: { in: partnerIds }, account: { type: "CREDIT_CARD" } }, select: { id: true } })) as Array<{ id: string }>).map((t) => t.id),
  );
  const transferFromCard = new Set(credits.filter((c) => cardSides.has(partnerOf.get(c.id) ?? "")).map((c) => c.id));

  const ids = credits.flatMap((c) => [c.id, ...(partnerOf.get(c.id) ? [partnerOf.get(c.id)!] : [])]);
  const taken = new Set(
    ((await prisma.actualEntry.findMany({ where: { bankTransactionId: { in: ids } }, select: { bankTransactionId: true } })) as Array<{ bankTransactionId: string | null }>)
      .map((a) => a.bankTransactionId!),
  );
  const dismissed = new Set(
    ((await prisma.reviewDismissal.findMany({ where: { kind: "match" }, select: { key: true } })) as Array<{ key: string }>).map((d) => d.key),
  );

  let recorded = 0;
  for (const item of linked) {
    const bank = item.paysCard!.bankAccount!;
    const dueDay = bank.paymentDueDay ?? item.dueDay;
    if (!dueDay) continue;
    const mine = credits.filter((c) => c.accountId === bank.id).sort((a, b) => a.postedOn.getTime() - b.postedOn.getTime());
    for (const c of mine) {
      const link = partnerOf.get(c.id) ?? c.id;
      if (taken.has(c.id) || taken.has(link)) continue;
      if (dismissed.has(`${item.id}:${link}`) || dismissed.has(`${item.id}:${c.id}`)) continue;
      const { year, month } = paymentMonth(iso(c.postedOn), dueDay, bank.statementCloseDay);
      const existing = await prisma.actualEntry.findUnique({ where: { lineItemId_year_month: { lineItemId: item.id, year, month } }, select: { id: true } });
      // A second payment in the same cycle leaves the first as recorded.
      if (existing) continue;
      // Paid from another card (a balance transfer): nothing left checking for it.
      const fromCard = transferFromCard.has(c.id);
      await recordActual(item.id, year, month, fromCard ? 0 : toCents(c.amount), fromCard ? "Balance transfer" : undefined, c.postedOn);
      await prisma.actualEntry.update({
        where: { lineItemId_year_month: { lineItemId: item.id, year, month } },
        data: { source: "auto", bankTransactionId: link },
      });
      taken.add(link);
      taken.add(c.id);
      recorded += 1;
    }
  }
  return recorded;
}

/**
 * 3. A payment tied to a bank transfer belongs to the statement it paid. One recorded for another
 * month (by hand, or before a card's days were set) moves there when that month has none yet.
 * Returns how many moved.
 */
export async function realignCardPayments(): Promise<number> {
  const items = (await prisma.lineItem.findMany({
    where: { kind: { not: "INCOME" }, paysCardId: { not: null } },
    select: { id: true, dueDay: true, paysCard: { select: { bankAccount: { select: { statementCloseDay: true, paymentDueDay: true } } } } },
  })) as Array<{ id: string; dueDay: number | null; paysCard: { bankAccount: { statementCloseDay: number | null; paymentDueDay: number | null } | null } | null }>;
  const since = new Date(Date.now() - 120 * DAY);
  let moved = 0;
  for (const item of items) {
    const bank = item.paysCard?.bankAccount;
    const dueDay = bank?.paymentDueDay ?? item.dueDay;
    if (!bank?.statementCloseDay || !dueDay) continue;
    const rows = (await prisma.actualEntry.findMany({
      where: { lineItemId: item.id, bankTransaction: { postedOn: { gte: since } } },
      select: { id: true, year: true, month: true, bankTransaction: { select: { postedOn: true } } },
    })) as Array<{ id: string; year: number; month: number; bankTransaction: { postedOn: Date } | null }>;
    for (const r of rows) {
      if (!r.bankTransaction) continue;
      const to = paymentMonth(iso(r.bankTransaction.postedOn), dueDay, bank.statementCloseDay);
      if (to.year === r.year && to.month === r.month) continue;
      const taken = await prisma.actualEntry.findUnique({ where: { lineItemId_year_month: { lineItemId: item.id, year: to.year, month: to.month } }, select: { id: true } });
      if (taken) continue;
      await prisma.actualEntry.update({ where: { id: r.id }, data: { year: to.year, month: to.month } });
      moved++;
    }
  }
  return moved;
}
