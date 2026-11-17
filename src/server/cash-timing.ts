/**
 * Cash timing (src/lib/cash-timing.ts), gathered for the rest of this month
 * and all of next: checking now, paydays still to come, bills paid from
 * checking that aren't paid yet (overdue ones today), each card's payment in
 * full on its due date, and the 0% card's monthly payment.
 */

import { prisma } from "@/lib/prisma";
import { cashTiming, type CashEvent, type CashTiming } from "@/lib/cash-timing";
import { getMonthView, type MonthEntry } from "./month";
import { listCardPayments } from "./card-payments";
import { billTypes, dueIso, type BillItem, type CardRow } from "./month-plan";

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export interface CashTimingView extends CashTiming {
  today: string;
  until: string;
  /** Checking isn't known (no bills account, or no balance yet). */
  missing: boolean;
  /** When the checking balance was last read. */
  balanceAsOf: string | null;
  /** Cards without statement and due days set, so their payments can't be placed. */
  cardsWithoutDays: number;
}

const addMonth = (iso: string, by = 1) => {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + by, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(last, Number(iso.slice(8, 10)))).padStart(2, "0")}`;
};

/** [debtCents] is the month's 0% debt payment, from the month plan. */
export async function getCashTiming(debtCents: number): Promise<CashTimingView> {
  const today = localToday();
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const next = new Date(Date.UTC(y, m, 1));
  const until = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

  const [now, later, items, cards, cardRows, allCards] = await Promise.all([
    getMonthView(y, m),
    getMonthView(next.getUTCFullYear(), next.getUTCMonth() + 1),
    prisma.lineItem.findMany({ select: { id: true, name: true, kind: true, paysCardId: true, paysCardLocked: true, paidFromSurplus: true, chargedToId: true } }) as Promise<
      Array<BillItem & { chargedToId: string | null }>
    >,
    listCardPayments(today),
    prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD", hidden: false }, select: { id: true, name: true, nickname: true, institution: true, promoEndsOn: true } }) as Promise<CardRow[]>,
    prisma.bankAccount.count({ where: { type: "CREDIT_CARD", hidden: false } }),
  ]);
  const { isCardPayment, isDebt } = billTypes(items, cardRows, today);
  const onCard = new Set(items.filter((i) => i.chargedToId).map((i) => i.id));

  const events: CashEvent[] = [];
  const seen = new Set<string>();
  const add = (e: MonthEntry, overdue = false) => {
    const key = `${e.lineItemId}:${e.year}:${e.month}`;
    if (seen.has(key) || e.skipped || e.actualCents !== null || e.budgetedCents <= 0) return;
    seen.add(key);
    const date = dueIso(e.year, e.month, e.dueDay);
    if (e.kind === "INCOME") {
      if (date >= today) events.push({ date, label: e.name, cents: e.budgetedCents, kind: "pay" });
      return;
    }
    if (isCardPayment(e.lineItemId) || isDebt(e.lineItemId) || e.paidFromSurplus || onCard.has(e.lineItemId)) return;
    events.push({ date, label: e.name, cents: -e.budgetedCents, kind: "bill", overdue: overdue || date < today });
  };
  for (const v of [now, later]) {
    for (const e of v.income) add(e);
    for (const e of [...v.halves[0].entries, ...v.halves[1].entries]) add(e);
  }
  for (const e of now.carried) add(e, true);

  // Cards: the statement in full on its due date, then what's on the card since (at least) the month after.
  for (const c of cards) {
    const promo = !!(c.promoEndsOn && c.promoEndsOn >= today);
    if (promo) {
      for (const d of [c.nextDue, addMonth(c.nextDue)]) if (d <= until && debtCents > 0) events.push({ date: d, label: c.name, cents: -debtCents, kind: "debt" });
      continue;
    }
    if (c.dueCents > 0) events.push({ date: c.nextDue, label: c.name, cents: -c.dueCents, kind: "card" });
    const after = addMonth(c.nextDue);
    if (c.newChargesCents > 0 && after <= until) events.push({ date: after, label: c.name, cents: -c.newChargesCents, kind: "card", estimate: true });
  }

  const start = now.billsBalanceCents;
  const t = cashTiming({ today, until, startCents: start ?? 0, events });
  return { ...t, today, until, missing: start === null, balanceAsOf: now.billsBankDataAt ?? now.billsBalanceAsOf, cardsWithoutDays: allCards - cards.length };
}
