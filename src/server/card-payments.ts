/** Card payments: what each card needs paid and by when. */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { displayAccountName } from "@/lib/account-type";
import { cardStatus, lastCloseDate, type CardStatus } from "@/lib/card-payment";
import { NotFoundError, ValidationError } from "./errors";
import { CARD_COLORS, isCustomColor } from "@/lib/card-colors";

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
  nickname: string | null;
};

/** Cards with both days set, soonest due first. */
export async function listCardPayments(today = localToday()): Promise<CardPayment[]> {
  const cards = (await prisma.bankAccount.findMany({
    where: { type: "CREDIT_CARD", hidden: false, statementCloseDay: { not: null }, paymentDueDay: { not: null } },
    select: { id: true, name: true, nickname: true, institution: true, balance: true, statementCloseDay: true, paymentDueDay: true, promoEndsOn: true },
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
    out.push({ ...status, id: c.id, name: c.nickname || displayAccountName(c.name), institution: c.institution, promoEndsOn: c.promoEndsOn ? iso(c.promoEndsOn) : null });
  }
  return out.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}

export async function setCardTerms(id: string, input: { closeDay: number | null; dueDay: number | null; promoEndsOn: string | null; color?: string | null; nickname?: string | null }): Promise<void> {
  const card = await prisma.bankAccount.findUnique({ where: { id }, select: { type: true } });
  if (!card) throw new NotFoundError("Card");
  const day = (n: number | null, field: string) => {
    if (n === null) return null;
    if (!Number.isInteger(n) || n < 1 || n > 31) throw new ValidationError({ [field]: ["Use a day from 1 to 31"] });
    return n;
  };
  if (input.promoEndsOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.promoEndsOn)) throw new ValidationError({ promoEndsOn: ["Use a date"] });
  const nickname = input.nickname === undefined ? undefined : input.nickname?.trim().slice(0, 60) || null;
  if (input.color && !isCustomColor(input.color) && !CARD_COLORS.some((c) => c.id === input.color)) throw new ValidationError({ color: ["Unknown color"] });
  await prisma.bankAccount.update({
    where: { id },
    data: {
      statementCloseDay: day(input.closeDay, "closeDay"),
      paymentDueDay: day(input.dueDay, "dueDay"),
      promoEndsOn: input.promoEndsOn ? new Date(`${input.promoEndsOn}T00:00:00Z`) : null,
      ...(input.color === undefined ? {} : { cardColor: input.color ? input.color.toLowerCase() : null }),
      ...(nickname === undefined ? {} : { nickname }),
    },
  });
}

export interface CardRow {
  id: string;
  name: string;
  institution: string | null;
  owedNowCents: number;
  /** Null until the card's closing and due days are set. */
  status: CardPayment | null;
  /** A preset id from src/lib/card-colors.ts, or #rrggbb. */
  color: string | null;
  /** The last digits the feed shows in the account name, if any. */
  lastDigits: string | null;
}

export interface CardOverview {
  totalOwedCents: number;
  /** What to pay this cycle across cards with their days set: full statements, and the monthly payoff on 0% balances. */
  payThisCycleCents: number;
  nextDue: string | null;
  rows: CardRow[];
}

/** Every card that isn't hidden: what's owed now, and for cards with their days set, the statement picture. */
export async function cardOverview(today = localToday()): Promise<CardOverview> {
  const [cards, payments] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { type: "CREDIT_CARD", hidden: false },
      select: { id: true, name: true, nickname: true, institution: true, balance: true, statementCloseDay: true, paymentDueDay: true, cardColor: true },
    }) as Promise<Array<{ id: string; name: string; nickname: string | null; institution: string | null; balance: { toString(): string } | null; statementCloseDay: number | null; paymentDueDay: number | null; cardColor: string | null }>>,
    listCardPayments(today),
  ]);
  const byId = new Map(payments.map((p) => [p.id, p]));
  const rows: CardRow[] = cards
    .map((c) => ({
      id: c.id,
      name: c.nickname || displayAccountName(c.name),
      institution: c.institution,
      owedNowCents: Math.max(0, c.balance === null ? 0 : -toCents(c.balance)),
      status: byId.get(c.id) ?? null,
      color: c.cardColor,
      lastDigits: /(\d{4})\)?\s*$/.exec(c.name)?.[1] ?? null,
    }))
    // A paid-off card with no days set has nothing to say.
    .filter((r) => r.owedNowCents > 0 || r.status)
    .sort((a, b) => (a.status?.nextDue ?? "9999").localeCompare(b.status?.nextDue ?? "9999") || b.owedNowCents - a.owedNowCents);
  const due = payments.filter((p) => p.suggestedCents > 0);
  return {
    totalOwedCents: rows.reduce((s, r) => s + r.owedNowCents, 0),
    payThisCycleCents: payments.reduce((s, p) => s + p.suggestedCents, 0),
    nextDue: due.length ? due.map((p) => p.nextDue).sort()[0] : null,
    rows,
  };
}

export interface PayoffTracker {
  id: string;
  name: string;
  /** The balance moved onto the card (its largest transfer in), when the feed shows it. */
  startCents: number | null;
  startOn: string | null;
  balanceCents: number;
  /** How much of the starting balance is paid down. */
  paidCents: number | null;
  endsOn: string;
  paymentsLeft: number;
  /** What each payment needs to be now to clear it in time. */
  monthlyCents: number;
  /** What each payment needed to be at the start, for comparison. */
  planMonthlyCents: number | null;
  onTrack: boolean;
}

/** Cards on a 0% offer: how far along the payoff is, and whether it's on schedule. */
export async function payoffTrackers(today = localToday()): Promise<PayoffTracker[]> {
  const { dueDatesThrough, dueAfter } = await import("@/lib/card-payment");
  const cards = (await listCardPayments(today)).filter((c) => c.promoEndsOn && c.paymentsLeft && c.monthlyCents);
  const out: PayoffTracker[] = [];
  for (const c of cards) {
    const ends = new Date(`${c.promoEndsOn}T00:00:00Z`);
    const moved = (await prisma.bankTransaction.findFirst({
      where: { accountId: c.id, kind: "TRANSFER", amount: { lt: 0 }, postedOn: { gte: new Date(ends.getTime() - 24 * 31 * DAY), lte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { amount: "asc" },
      select: { postedOn: true, amount: true },
    })) as { postedOn: Date; amount: { toString(): string } } | null;
    const startCents = moved && -toCents(moved.amount) >= 50_000 ? -toCents(moved.amount) : null;
    const startOn = startCents && moved ? iso(moved.postedOn) : null;
    const dueDay = Number(c.nextDue.slice(8, 10));
    const totalPayments = startOn ? dueDatesThrough(dueAfter(startOn, dueDay), c.promoEndsOn!, dueDay) : 0;
    const planMonthlyCents = startCents && totalPayments ? Math.ceil(startCents / totalPayments) : null;
    out.push({
      id: c.id,
      name: c.name,
      startCents,
      startOn,
      balanceCents: c.owedNowCents,
      paidCents: startCents === null ? null : Math.max(0, startCents - c.owedNowCents),
      endsOn: c.promoEndsOn!,
      paymentsLeft: c.paymentsLeft!,
      monthlyCents: c.monthlyCents!,
      planMonthlyCents,
      // No payment has come due yet: nothing to be behind on.
      onTrack: planMonthlyCents === null || c.paymentsLeft! >= totalPayments || c.monthlyCents! <= planMonthlyCents + 100,
    });
  }
  return out;
}
