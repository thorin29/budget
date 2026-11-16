/** Card payments: what each card needs paid and by when. */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { displayAccountName } from "@/lib/account-type";
import { cardStatus, lastCloseDate, type CardStatus } from "@/lib/card-payment";
import { NotFoundError, ValidationError } from "./errors";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export interface CardPayment extends CardStatus {
  id: string;
  name: string;
  institution: string | null;
  promoEndsOn: string | null;
}

type Row = {
  id: string;
  name: string;
  institution: string | null;
  balance: { toString(): string } | null;
  statementCloseDay: number | null;
  paymentDueDay: number | null;
  promoEndsOn: Date | null;
};

/** Cards with both days set, soonest due first. */
export async function listCardPayments(today = localToday()): Promise<CardPayment[]> {
  const cards = (await prisma.bankAccount.findMany({
    where: { type: "CREDIT_CARD", hidden: false, statementCloseDay: { not: null }, paymentDueDay: { not: null } },
    select: { id: true, name: true, institution: true, balance: true, statementCloseDay: true, paymentDueDay: true, promoEndsOn: true },
  })) as Row[];
  const out: CardPayment[] = [];
  for (const c of cards) {
    const since = new Date(Date.parse(`${lastCloseDate(today, c.statementCloseDay!)}T00:00:00Z`) - DAY);
    const txns = (await prisma.bankTransaction.findMany({
      where: { accountId: c.id, postedOn: { gte: since }, pending: false },
      select: { postedOn: true, amount: true },
    })) as Array<{ postedOn: Date; amount: { toString(): string } }>;
    const status = cardStatus({
      balanceCents: c.balance === null ? 0 : toCents(c.balance),
      closeDay: c.statementCloseDay!,
      dueDay: c.paymentDueDay!,
      promoEndsOn: c.promoEndsOn ? iso(c.promoEndsOn) : null,
      txns: txns.map((t) => ({ postedOn: iso(t.postedOn), amountCents: toCents(t.amount) })),
      today,
    });
    out.push({ ...status, id: c.id, name: displayAccountName(c.name), institution: c.institution, promoEndsOn: c.promoEndsOn ? iso(c.promoEndsOn) : null });
  }
  return out.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}

export async function setCardTerms(id: string, input: { closeDay: number | null; dueDay: number | null; promoEndsOn: string | null }): Promise<void> {
  const card = await prisma.bankAccount.findUnique({ where: { id }, select: { type: true } });
  if (!card) throw new NotFoundError("Card");
  const day = (n: number | null, field: string) => {
    if (n === null) return null;
    if (!Number.isInteger(n) || n < 1 || n > 31) throw new ValidationError({ [field]: ["Use a day from 1 to 31"] });
    return n;
  };
  if (input.promoEndsOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.promoEndsOn)) throw new ValidationError({ promoEndsOn: ["Use a date"] });
  await prisma.bankAccount.update({
    where: { id },
    data: {
      statementCloseDay: day(input.closeDay, "closeDay"),
      paymentDueDay: day(input.dueDay, "dueDay"),
      promoEndsOn: input.promoEndsOn ? new Date(`${input.promoEndsOn}T00:00:00Z`) : null,
    },
  });
}
