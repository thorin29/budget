/**
 * Everything owed, in two kinds:
 *
 *  - Installment debt: a set balance paid down to zero (a mortgage, a car or
 *    student loan, an orthodontist, a 0% balance transfer). From bills that
 *    pay off a balance, and from cards on a 0% offer.
 *  - Revolving debt: credit cards, whose balance goes up and down with no end.
 *
 * Loan-looking bills without a balance are listed so their details can be
 * filled in; with a balance and interest rate, the payoff date counts interest.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { displayAccountName } from "@/lib/account-type";
import { listPayoffs } from "./payoff";
import { listCardPayments, payoffTrackers } from "./card-payments";
import { NotFoundError, ValidationError } from "./errors";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Bills that look like loans by name or category. */
const LOAN_WORDS = /\b(loans?|mortgage|student|mohela|navient|nelnet|sallie|great lakes|aidvantage|(car|auto|truck|vehicle) (note|payment|finance)|financ\w*|ortho\w*|braces|payment plan|installment|lease|heloc)\b/i;
/** Card charges that are interest or fees. */
const INTEREST_FEE = /\b(interest|finance charge|late fee|annual fee|membership fee|foreign (transaction )?fee|cash advance fee|over ?limit fee|returned payment fee|fees?)\b/i;
const NOT_LOAN = "loan";

export interface InstallmentDebt {
  /** A bill, or a 0% card. */
  kind: "bill" | "zero";
  id: string;
  name: string;
  balanceCents: number;
  paymentCents: number;
  aprBps: number | null;
  paymentsLeft: number | null;
  /** YYYY-MM of the last payment. */
  lastMonth: string | null;
  neverEnds: boolean;
  interestLeftCents: number | null;
  source: "bank" | "balance" | "card";
  /** YYYY-MM-DD the balance was entered. */
  asOf: string | null;
  /** A 0% offer's end. */
  endsOn: string | null;
  /** Paid down so far, against the starting balance, when known. */
  startCents: number | null;
}

export interface LoanNeedingDetails {
  lineItemId: string;
  name: string;
  paymentCents: number;
  category: string | null;
}

export interface RevolvingDebt {
  id: string;
  name: string;
  balanceCents: number;
  /** Null when the card's statement days aren't set. */
  statementCents: number | null;
  dueCents: number | null;
  dueOn: string | null;
  /** paid: this statement is paid; due: some of it is still to pay; none: no balance; unknown: no statement days. */
  status: "paid" | "due" | "none" | "unknown";
  interestFeesCents: number;
  interestFees: Array<{ date: string; name: string; cents: number }>;
}

export interface DebtView {
  today: string;
  installment: InstallmentDebt[];
  installmentCents: number;
  needsDetails: LoanNeedingDetails[];
  revolving: RevolvingDebt[];
  revolvingCents: number;
  totalCents: number;
}

export async function getDebt(debtPaymentCents: number): Promise<DebtView> {
  const today = localToday();
  const yearStart = new Date(`${today.slice(0, 4)}-01-01T00:00:00Z`);
  const [payoffs, trackers, cards, allCards, items, dismissed] = await Promise.all([
    listPayoffs(today),
    payoffTrackers(today).catch(() => []),
    listCardPayments(today),
    prisma.bankAccount.findMany({
      where: { type: "CREDIT_CARD", hidden: false },
      select: { id: true, name: true, nickname: true, balance: true, promoEndsOn: true },
    }) as Promise<Array<{ id: string; name: string; nickname: string | null; balance: { toString(): string } | null; promoEndsOn: Date | null }>>,
    prisma.lineItem.findMany({
      where: { active: true, kind: "BILL", payoffBalance: null, payoffAccountId: null, paysCardId: null, paidFromSurplus: false },
      select: { id: true, name: true, plannedAmount: true, endYear: true, endMonth: true, category: { select: { name: true } } },
    }) as Promise<Array<{ id: string; name: string; plannedAmount: { toString(): string }; endYear: number | null; endMonth: number | null; category: { name: string } | null }>>,
    prisma.reviewDismissal.findMany({ where: { kind: NOT_LOAN }, select: { key: true } }) as Promise<Array<{ key: string }>>,
  ]);

  const ym = (y: number | null, m: number | null) => (y && m ? `${y}-${String(m).padStart(2, "0")}` : null);
  const installment: InstallmentDebt[] = payoffs
    .filter((p) => !p.paidOff)
    .map((p) => ({
      kind: "bill" as const, id: p.lineItemId, name: p.name, balanceCents: p.remainingCents, paymentCents: p.plannedCents, aprBps: p.aprBps,
      paymentsLeft: p.paymentsLeft, lastMonth: ym(p.lastYear, p.lastMonth), neverEnds: p.neverEnds, interestLeftCents: p.interestLeftCents,
      source: p.source, asOf: p.asOf, endsOn: null, startCents: null,
    }));
  for (const t of trackers) {
    const months = debtPaymentCents > 0 ? Math.ceil(t.balanceCents / debtPaymentCents) : null;
    const last = months ? new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + months, 1)) : null;
    installment.push({
      kind: "zero", id: t.id, name: t.name, balanceCents: t.balanceCents, paymentCents: debtPaymentCents, aprBps: 0, paymentsLeft: months,
      lastMonth: last ? iso(last).slice(0, 7) : null, neverEnds: false, interestLeftCents: null, source: "card", asOf: null, endsOn: t.endsOn, startCents: t.startCents,
    });
  }
  installment.sort((a, b) => b.balanceCents - a.balanceCents);

  const skip = new Set(dismissed.map((d) => d.key));
  const needsDetails: LoanNeedingDetails[] = items
    .filter((i) => !skip.has(i.id) && !(i.endYear && i.endYear * 12 + (i.endMonth ?? 12) < Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7))))
    .filter((i) => !/insurance/i.test(`${i.name} ${i.category?.name ?? ""}`))
    .filter((i) => LOAN_WORDS.test(i.name) || LOAN_WORDS.test(i.category?.name ?? "") || /mortgage/i.test(i.category?.name ?? ""))
    .map((i) => ({ lineItemId: i.id, name: i.name, paymentCents: toCents(i.plannedAmount), category: i.category?.name ?? null }));

  // Revolving: every card not on a 0% offer.
  const status = new Map(cards.map((c) => [c.id, c]));
  const fees = (await prisma.bankTransaction.findMany({
    where: { accountId: { in: allCards.map((c) => c.id) }, postedOn: { gte: yearStart }, amount: { lt: 0 } },
    select: { accountId: true, postedOn: true, amount: true, merchant: true, description: true, category: { select: { name: true } } },
    orderBy: { postedOn: "desc" },
  })) as Array<{ accountId: string; postedOn: Date; amount: { toString(): string }; merchant: string; description: string; category: { name: string } | null }>;
  const revolving: RevolvingDebt[] = allCards
    .filter((c) => !(c.promoEndsOn && iso(c.promoEndsOn) >= today))
    .map((c): RevolvingDebt => {
      const s = status.get(c.id);
      const balanceCents = s ? s.owedNowCents : Math.max(0, -(c.balance === null ? 0 : toCents(c.balance)));
      const charged = fees
        .filter((f) => f.accountId === c.id && (/interest|fees?/i.test(f.category?.name ?? "") || INTEREST_FEE.test(`${f.description} ${f.merchant}`)))
        .map((f) => ({ date: iso(f.postedOn), name: f.merchant || f.description, cents: -toCents(f.amount) }));
      return {
        id: c.id,
        name: c.nickname || displayAccountName(c.name),
        balanceCents,
        statementCents: s ? s.statementCents : null,
        dueCents: s ? s.dueCents : null,
        dueOn: s ? s.nextDue : null,
        status: !s ? "unknown" : balanceCents <= 0 ? "none" : s.dueCents <= 0 ? "paid" : "due",
        interestFeesCents: charged.reduce((t, f) => t + f.cents, 0),
        interestFees: charged,
      };
    })
    .sort((a, b) => b.balanceCents - a.balanceCents);

  const installmentCents = installment.reduce((t, d) => t + d.balanceCents, 0);
  const revolvingCents = revolving.reduce((t, d) => t + Math.max(0, d.balanceCents), 0);
  return { today, installment, installmentCents, needsDetails, revolving, revolvingCents, totalCents: installmentCents + revolvingCents };
}

/** A loan's balance (as of today) and interest rate, so its payoff date can be worked out. */
export async function saveLoanDetails(lineItemId: string, balanceCents: number | null, aprBps: number | null): Promise<void> {
  const item = await prisma.lineItem.findUnique({ where: { id: lineItemId }, select: { id: true, payoffAccountId: true } });
  if (!item) throw new NotFoundError("Bill");
  if (balanceCents !== null && (!Number.isInteger(balanceCents) || balanceCents < 0 || balanceCents > 10_000_000_000)) throw new ValidationError({ balance: ["Enter the amount left to pay"] });
  if (aprBps !== null && (!Number.isInteger(aprBps) || aprBps < 0 || aprBps > 10_000)) throw new ValidationError({ apr: ["Enter the rate as a percent, like 6.5"] });
  await prisma.lineItem.update({
    where: { id: lineItemId },
    data: {
      ...(balanceCents !== null && !item.payoffAccountId ? { payoffBalance: (balanceCents / 100).toFixed(2), payoffAsOf: new Date(`${localToday()}T00:00:00Z`) } : {}),
      payoffAprBps: aprBps,
    },
  });
}

/** This bill isn't a loan: stop asking for its balance. */
export async function notALoan(lineItemId: string): Promise<void> {
  await prisma.reviewDismissal.upsert({ where: { kind_key: { kind: NOT_LOAN, key: lineItemId } }, create: { kind: NOT_LOAN, key: lineItemId }, update: {} });
}
