/**
 * Outlook: next month, from the 1st to the day before the second paycheck. It starts from what
 * this month carries over (the bank check on Overview), adds the pay landing in that window and
 * takes off the bills and the debt payment due in it. Card balances, and in the budgeted view the
 * rest of this month's budgets, are already set aside in the carry-over, so they're listed for
 * reference (they're the next card payments) and not taken off again. Next month's own everyday
 * spending goes on the cards and is paid the month after, so it isn't here either.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { displayAccountName } from "@/lib/account-type";
import { getMonthView, type MonthEntry } from "./month";
import { listCardPayments } from "./card-payments";
import { billTypes, dueIso, type BillItem, type CardRow } from "./month-plan";

export interface OutlookLine {
  date: string;
  name: string;
  cents: number;
}

export interface OutlookView {
  /** The first day of next month. */
  from: string;
  /** The day before the second paycheck, or the end of next month. */
  to: string;
  /** The paycheck that ends the window, when there is one. */
  nextPay: OutlookLine | null;
  /** The paycheck inside the window: it splits it into before and after payday. */
  payday: OutlookLine | null;
  pay: OutlookLine[];
  bills: OutlookLine[];
  /** Bills in the window charged to a card: they're paid with the card later, not from checking. */
  onCard: OutlookLine[];
  debt: OutlookLine[];
  /**
   * What each card is owed now, all of it set aside in the carry-over: the statement still to pay
   * (with its due date), and what's been charged since it closed (with the next closing date).
   * Cards without statement and due days set only have their balance.
   */
  cards: Array<{ name: string; cents: number; statementCents: number; dueOn: string | null; buildingCents: number; closesOn: string | null }>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** [today] is YYYY-MM-DD; [debtCents] is the monthly debt payment from the month plan. */
export async function getOutlook(today: string, debtCents: number): Promise<OutlookView> {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const next = new Date(Date.UTC(y, m, 1));
  const [ny, nm] = [next.getUTCFullYear(), next.getUTCMonth() + 1];
  const from = `${ny}-${pad(nm)}-01`;
  const monthEnd = new Date(Date.UTC(ny, nm, 0)).toISOString().slice(0, 10);

  const [view, items, cardRows, statuses, allCards] = await Promise.all([
    getMonthView(ny, nm),
    prisma.lineItem.findMany({ select: { id: true, name: true, kind: true, paysCardId: true, paysCardLocked: true, paidFromSurplus: true, chargedToId: true } }) as Promise<
      Array<BillItem & { chargedToId: string | null }>
    >,
    prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD", hidden: false }, select: { id: true, name: true, nickname: true, institution: true, promoEndsOn: true } }) as Promise<CardRow[]>,
    listCardPayments(today),
    prisma.bankAccount.findMany({
      where: { type: "CREDIT_CARD", hidden: false },
      select: { id: true, name: true, nickname: true, balance: true, promoEndsOn: true },
    }) as Promise<Array<{ id: string; name: string; nickname: string | null; balance: { toString(): string } | null; promoEndsOn: Date | null }>>,
  ]);
  const { isCardPayment, isDebt } = billTypes(items, cardRows, today);
  const onCardIds = new Set(items.filter((i) => i.chargedToId).map((i) => i.id));
  const date = (e: MonthEntry) => dueIso(e.year, e.month, e.dueDay);
  const live = (e: MonthEntry) => !e.skipped && e.budgetedCents > 0;

  // The paycheck: the income that lands more than once in the month (every two weeks), whether
  // it's one line item or several numbered ones ("Paycheck", "Paycheck 2").
  const income = view.income.filter(live).sort((a, b) => date(a).localeCompare(date(b)));
  const key = (e: MonthEntry) => e.name.toLowerCase().replace(/[\s#]*\d+$/, "").trim() || e.lineItemId;
  const counts = new Map<string, number>();
  for (const e of income) counts.set(key(e), (counts.get(key(e)) ?? 0) + 1);
  const paycheckKey = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const paychecks = paycheckKey ? income.filter((e) => key(e) === paycheckKey) : [];
  const second = paychecks[1] ?? null;
  const to = second ? dayBefore(date(second)) : monthEnd;
  const inWindow = (e: MonthEntry) => date(e) >= from && date(e) <= to;
  const line = (e: MonthEntry): OutlookLine => ({ date: date(e), name: e.name, cents: e.budgetedCents });

  const entries = [...view.halves[0].entries, ...view.halves[1].entries].filter((e) => live(e) && inWindow(e) && !e.paidFromSurplus);
  const bills = entries.filter((e) => !isCardPayment(e.lineItemId) && !isDebt(e.lineItemId) && !onCardIds.has(e.lineItemId)).map(line);
  const onCard = entries.filter((e) => !isCardPayment(e.lineItemId) && !isDebt(e.lineItemId) && onCardIds.has(e.lineItemId)).map(line);

  // The debt payment: on a 0% card's due date, or the debt line items in the window.
  const promoIds = new Set(allCards.filter((c) => c.promoEndsOn && c.promoEndsOn.toISOString().slice(0, 10) >= today).map((c) => c.id));
  const debt: OutlookLine[] = [];
  if (debtCents > 0) {
    for (const s of statuses.filter((c) => promoIds.has(c.id))) {
      const d = s.nextDue.slice(0, 7) === from.slice(0, 7) ? s.nextDue : `${from.slice(0, 7)}-${s.nextDue.slice(8, 10)}`;
      if (d >= from && d <= to) debt.push({ date: d, name: `${s.name} (debt payment)`, cents: debtCents });
    }
    if (!debt.length) for (const e of entries.filter((e) => isDebt(e.lineItemId))) debt.push({ ...line(e), cents: debtCents });
  }

  const statusOf = new Map(statuses.map((st) => [st.id, st]));
  const addMonth = (iso: string) => {
    const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(Math.min(last, Number(iso.slice(8, 10))))}`;
  };
  const cards = allCards
    .filter((c) => !promoIds.has(c.id))
    .map((c) => {
      const cents = c.balance === null ? 0 : Math.max(0, -toCents(c.balance));
      const st = statusOf.get(c.id);
      const statementCents = st ? Math.min(cents, st.dueCents) : 0;
      return {
        name: c.nickname || displayAccountName(c.name),
        cents,
        statementCents,
        dueOn: st && statementCents > 0 ? st.nextDue : null,
        buildingCents: st ? cents - statementCents : cents,
        closesOn: st ? addMonth(st.lastClose) : null,
      };
    })
    .filter((c) => c.cents > 0);

  const byDate = (a: OutlookLine, b: OutlookLine) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name);
  return {
    from,
    to,
    nextPay: second ? line(second) : null,
    payday: paychecks[0] && inWindow(paychecks[0]) && paychecks[0] !== second ? line(paychecks[0]) : null,
    pay: income.filter(inWindow).map(line).sort(byDate),
    bills: bills.sort(byDate),
    onCard: onCard.sort(byDate),
    debt,
    cards,
  };
}
