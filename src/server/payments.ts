/**
 * The Payments page: every payment coming up (card statements, the 0% payment, bills that vary),
 * and what each one does before it's made.
 *
 *  - Planned vs actual: a closed statement against its plan (statement-plan.ts), with what's left
 *    over (interest, fees, charges without a budget) and any balance carried from the statement
 *    before, so the rows add up to the statement.
 *  - The month's income: the pay in the month the payment is due, less that month's other bills,
 *    the 0% payment and the other cards' statements. Money already in checking isn't counted.
 *  - Checking until payday: checking now, plus pay, less every payment on its day, through the day
 *    before the first payday after this payment. The page moves this payment and finds the low.
 *  - The period: the month, or a card's statement cycle, set out the way a month is.
 *
 * Everything for every payment comes in one go, so the page switches payments and amounts without
 * asking the server again.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { isExtraIncome } from "@/lib/extra-income";
import { portionBudget } from "@/lib/statement-portion";
import {
  getMonthPlan,
  dueIso,
  billTypes,
  type BillItem,
  type CardRow as BillCardRow,
  type MonthPlanView,
} from "./month-plan";
import type { MonthEntry } from "./month";
import { CHECKING, dueAfter, nextClose } from "./card-view";
import {
  statementEnv,
  planCycle,
  windowClosing,
  statementDueIn,
  cardTerms,
  type Env,
} from "./statement-plan";
import {
  plannedPayments,
  paymentKey,
  type PlannedPayment,
} from "./planned-payments";
import { checkingHistory } from "./checking-history";
import { cyclePlanCards } from "./cycle-cards";
import { budgetChanges, type BudgetChange } from "./budget-changes";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => Date.parse(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => iso(new Date(at(s) + n * DAY));
const daysBetween = (a: string, b: string) =>
  Math.round((at(b) - at(a)) / DAY) + 1;
const monthStart = (ym: string) => `${ym}-01`;
const monthEnd = (ym: string) =>
  iso(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)));
const nextYm = (ym: string) =>
  iso(
    new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1)),
  ).slice(0, 7);
const addMonth = (s: string, by = 1) => {
  const d = new Date(
    Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1 + by, 1),
  );
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return iso(
    new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        Math.min(last, Number(s.slice(8, 10))),
      ),
    ),
  );
};
const PAYMENT_WORDS =
  /\b(payment|pymt|pmt|thank you|autopay|auto pay|epay|online pmt|crcardpmt|card pmt)\b/i;

export type Tier = "BILLS" | "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED";

export interface PaymentChoice {
  /** The planned-payment key (planned-payments.ts). */
  key: string;
  kind: "card" | "debt" | "bill";
  /** The card (or the bill) it belongs to: a card has its closed statement and its open one. */
  group: string;
  /** Cards: "closed" for the last statement, "open" for the one building now. */
  cycle: "closed" | "open" | null;
  /** The one the page opens on for its card: the newest one not paid. */
  preferred: boolean;
  /** Open cycles: what the card owes now. */
  balanceCents: number | null;
  name: string;
  dueOn: string;
  /** The full statement, the month's 0% payment, or the bill's amount. */
  fullCents: number;
  /** Paid toward it already. */
  paidCents: number;
  set: PlannedPayment | null;
  /** YYYY-MM: the month whose income it's set against. */
  month: string;
  /** Cards: the statement's dates, and its plan against what's on it. */
  statement: StatementCheck | null;
  /** Cards planned by cycle: the last six statements. */
  history: Array<{
    closedOn: string;
    plannedCents: number;
    chargedCents: number;
  }>;
}

export interface StatementCheck {
  from: string;
  to: string;
  plannedCents: number;
  rows: Array<{ tier: Tier; plannedCents: number; actualCents: number }>;
  /** Charges without a budget, interest and fees: the statement less everything else. */
  otherCents: number;
  /** Left unpaid from the statement before. */
  carriedCents: number;
  /** Paid during the statement past what the statement before owed: it came off these charges. */
  paidDuringCents: number;
}

export interface MonthLedger {
  month: string;
  payCents: number;
  billsCents: number;
  debtCents: number;
  /** Every card's statement due that month, by card id. */
  cards: Record<string, number>;
  /** Bills that are payment choices (they come out when that choice is the one being set). */
  choiceBills: Record<string, number>;
}

export interface CashEvent {
  date: string;
  cents: number;
  kind: "pay" | "bill" | "card" | "debt";
  name: string;
  /** Set when the event is a payment choice: the page swaps in the amount and day picked. */
  key?: string;
}

export interface PeriodSummary {
  label: string;
  from: string;
  to: string;
  checkingInCents: number | null;
  checkingOutCents: number | null;
  rows: Array<{
    key: "INCOME" | "BILLS" | "DEBT" | "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED";
    plannedCents: number;
    actualCents: number;
    projectedCents: number;
  }>;
}

export interface PaymentsView {
  today: string;
  checking: { cents: number | null; asOf: string | null };
  choices: PaymentChoice[];
  ledgers: Record<string, MonthLedger>;
  events: CashEvent[];
  periods: PeriodSummary[];
  checkingHistory: Array<{ on: string; cents: number }>;
  changes: BudgetChange[];
}

type BankCard = {
  id: string;
  balance: { toString(): string } | null;
  statementCloseDay: number | null;
};

/** What card [card] owed at the end of [day], worked back from its balance now. */
async function owedOn(card: BankCard, day: string): Promise<number> {
  const after = (await prisma.bankTransaction.findMany({
    where: {
      accountId: card.id,
      pending: false,
      postedOn: { gt: new Date(`${day}T00:00:00Z`) },
    },
    select: { amount: true },
  })) as Array<{ amount: { toString(): string } }>;
  const owedNow =
    card.balance === null ? 0 : Math.max(0, -toCents(card.balance));
  return Math.max(
    0,
    owedNow + after.reduce((t, r) => t + toCents(r.amount), 0),
  );
}

/** Payments to the card from [from] to [to]: what came in that wasn't a refund. */
async function paymentsTo(
  cardId: string,
  from: string,
  to: string,
): Promise<number> {
  const rows = (await prisma.bankTransaction.findMany({
    where: {
      accountId: cardId,
      pending: false,
      postedOn: {
        gte: new Date(`${from}T00:00:00Z`),
        lte: new Date(`${to}T00:00:00Z`),
      },
    },
    select: { amount: true, kind: true, merchant: true, description: true },
  })) as Array<{
    amount: { toString(): string };
    kind: string;
    merchant: string | null;
    description: string;
  }>;
  return rows
    .filter(
      (r) =>
        toCents(r.amount) > 0 &&
        (r.kind === "TRANSFER" ||
          PAYMENT_WORDS.test(`${r.merchant ?? ""} ${r.description}`)),
    )
    .reduce((t, r) => t + toCents(r.amount), 0);
}

/** A closed statement from [from] to [to] against its plan. */
async function statementCheck(
  env: Env,
  card: BankCard,
  from: string,
  to: string,
  statementCents: number,
): Promise<StatementCheck> {
  const [cycle, spent] = await Promise.all([
    planCycle(env, card.id, from, to),
    env.spending(from, to, card.id),
  ]);
  const tierTotal = (tier: Tier) =>
    tier === "BILLS"
      ? spent.billCharges
      : [...spent.byGroup]
          .filter(([g]) => {
            const t = env.tierOf.get(g);
            return tier === "UNPLANNED"
              ? t === "UNPLANNED" || t === undefined
              : t === tier;
          })
          .reduce((s, [, c]) => s + c, 0);
  const planned: Record<Tier, number> = {
    BILLS: cycle.portions.reduce((t, p) => t + p.billsCents, 0),
    ESSENTIAL: cycle.portions.reduce((t, p) => t + p.essentialCents, 0),
    FLEXIBLE: cycle.portions.reduce((t, p) => t + p.extrasCents, 0),
    UNPLANNED: cycle.reserveCents,
  };
  const rows = (["BILLS", "ESSENTIAL", "FLEXIBLE", "UNPLANNED"] as Tier[]).map(
    (tier) => ({
      tier,
      plannedCents: planned[tier],
      actualCents: tierTotal(tier),
    }),
  );
  const before = await owedOn(card, addDays(from, -1));
  const paid = await paymentsTo(card.id, from, to);
  const carriedCents = Math.max(0, before - paid);
  const paidDuringCents = Math.max(0, paid - before);
  // statement = carried − paid during + every charge; what the budgets don't explain is "other".
  const otherCents =
    statementCents -
    carriedCents +
    paidDuringCents -
    rows.reduce((t, r) => t + r.actualCents, 0);
  return {
    from,
    to,
    plannedCents: cycle.plannedCents,
    rows,
    otherCents,
    carriedCents,
    paidDuringCents,
  };
}

export async function paymentsView(): Promise<PaymentsView> {
  const plan = await getMonthPlan();
  const today = plan.today;
  const env = await statementEnv(plan);
  const { listCardPayments } = await import("./card-payments");
  const [statuses, set, cycleCards, items, cardRows, bankCards] =
    await Promise.all([
      listCardPayments(today).catch(() => []),
      plannedPayments(),
      cyclePlanCards(),
      prisma.lineItem.findMany({
        select: {
          id: true,
          name: true,
          kind: true,
          paysCardId: true,
          paysCardLocked: true,
          paidFromSurplus: true,
          paydayNumber: true,
          scheduleKind: true,
          months: true,
          plannedAmount: true,
        },
      }) as Promise<
        Array<
          BillItem & {
            paydayNumber: number | null;
            scheduleKind: string;
            months: number[];
            plannedAmount: { toString(): string };
          }
        >
      >,
      prisma.bankAccount.findMany({
        where: { type: "CREDIT_CARD", hidden: false },
        select: {
          id: true,
          name: true,
          nickname: true,
          institution: true,
          promoEndsOn: true,
        },
      }) as Promise<BillCardRow[]>,
      prisma.bankAccount.findMany({
        where: { type: "CREDIT_CARD", hidden: false },
        select: { id: true, balance: true, statementCloseDay: true },
      }) as Promise<BankCard[]>,
    ]);
  const { isCardPayment, isDebt } = billTypes(items, cardRows, today);
  const debtCents = Math.max(0, plan.debt.cents - plan.debt.extraCents);
  const promo = statuses.filter((s) => s.promoEndsOn && s.promoEndsOn >= today);
  const regular = statuses.filter(
    (s) => !(s.promoEndsOn && s.promoEndsOn >= today),
  );
  const terms = await cardTerms(today);

  // ---- The choices.
  const choices: PaymentChoice[] = [];
  for (const st of regular) {
    const card = bankCards.find((c) => c.id === st.id);
    if (!card?.statementCloseDay || st.statementCents <= 0) continue;
    if (st.nextDue < addDays(today, -3) && st.dueCents <= 0) continue;
    const w = windowClosing(st.lastClose, card.statementCloseDay);
    const key = paymentKey.card(st.id, st.lastClose);
    const history: PaymentChoice["history"] = [];
    if (cycleCards.has(st.id)) {
      let close = st.lastClose;
      for (let i = 0; i < 6; i++) {
        const win = windowClosing(close, card.statementCloseDay);
        const owed = await owedOn(card, close);
        const before = await owedOn(card, addDays(win.from, -1));
        const paid = await paymentsTo(card.id, win.from, win.to);
        const p = await planCycle(env, card.id, win.from, win.to);
        // Charges on the statement: what it owed, less what came before, plus what was paid.
        history.unshift({
          closedOn: close,
          plannedCents: p.plannedCents,
          chargedCents: Math.max(0, owed - before + paid),
        });
        close = addDays(win.from, -1);
      }
    }
    const paidUp = st.dueCents <= 0;
    choices.push({
      key,
      kind: "card",
      group: st.id,
      cycle: "closed",
      preferred: !paidUp,
      balanceCents: null,
      name: st.name,
      dueOn: st.nextDue,
      fullCents: st.statementCents,
      paidCents: st.paidSinceCents,
      set: set[key] ?? null,
      month: st.nextDue.slice(0, 7),
      statement: await statementCheck(
        env,
        card,
        w.from,
        w.to,
        st.statementCents,
      ),
      history,
    });
    // The statement building now: its plan, against what's on the card so far.
    const close = nextClose(st.lastClose);
    const due = dueAfter(st.nextDue, close);
    if (due) {
      const openKey = paymentKey.card(st.id, close);
      const plannedOpen = await planCycle(
        env,
        card.id,
        addDays(st.lastClose, 1),
        close,
      );
      choices.push({
        key: openKey,
        kind: "card",
        group: st.id,
        cycle: "open",
        preferred: paidUp,
        balanceCents: st.owedNowCents,
        name: st.name,
        dueOn: due,
        fullCents: Math.max(plannedOpen.plannedCents, st.owedNowCents),
        paidCents: 0,
        set: set[openKey] ?? null,
        month: due.slice(0, 7),
        statement: await statementCheck(
          env,
          card,
          addDays(st.lastClose, 1),
          close,
          st.owedNowCents,
        ),
        history,
      });
    }
  }
  for (const st of promo) {
    const key = paymentKey.debt(st.id, st.nextDue);
    choices.push({
      key,
      kind: "debt",
      group: st.id,
      cycle: null,
      preferred: true,
      balanceCents: null,
      name: st.name,
      dueOn: st.nextDue,
      fullCents: debtCents,
      paidCents: st.paidSinceCents,
      set: set[key] ?? null,
      month: st.nextDue.slice(0, 7),
      statement: null,
      history: [],
    });
  }

  // ---- Month views through the furthest payday we need.
  const lastDue = choices.reduce((d, c) => (c.dueOn > d ? c.dueOn : d), today);
  const cycleEnds = regular
    .filter((s) => cycleCards.has(s.id))
    .map((s) => nextClose(s.lastClose));
  const horizon = [
    addDays(lastDue, 40),
    ...cycleEnds,
    monthEnd(today.slice(0, 7)),
  ]
    .sort()
    .at(-1)!;
  const months: string[] = [];
  for (let ym = today.slice(0, 7); ym <= horizon.slice(0, 7); ym = nextYm(ym))
    months.push(ym);
  const views = await Promise.all(months.map((ym) => env.view(ym)));

  // Cards planned by cycle first, then the other cards by statement, then the 0% card.
  const rank = (c: PaymentChoice) =>
    c.kind === "card" ? (cycleCards.has(c.group) ? 0 : 1) : 2;
  const size = new Map(
    choices
      .filter((c) => c.cycle === "closed")
      .map((c) => [c.group, c.fullCents]),
  );
  choices.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (size.get(b.group) ?? 0) - (size.get(a.group) ?? 0) ||
      a.group.localeCompare(b.group) ||
      (a.cycle === "closed" ? -1 : 1),
  );

  // ---- Cash events from today.
  const events: CashEvent[] = [];
  const lateCutoff = addDays(today, -5);
  const seen = new Set<string>();
  const add = (e: MonthEntry) => {
    const id = `${e.lineItemId}:${e.year}:${e.month}`;
    if (
      seen.has(id) ||
      e.skipped ||
      e.actualCents !== null ||
      e.budgetedCents <= 0 ||
      e.pendingCharge
    )
      return;
    seen.add(id);
    const date = dueIso(e.year, e.month, e.dueDay);
    if (e.kind === "INCOME") {
      if (date >= today)
        events.push({
          date,
          cents: e.budgetedCents,
          kind: "pay",
          name: e.name,
        });
      else if (date >= lateCutoff)
        events.push({
          date: today,
          cents: e.budgetedCents,
          kind: "pay",
          name: e.name,
        });
      return;
    }
    if (
      isCardPayment(e.lineItemId) ||
      isDebt(e.lineItemId) ||
      e.paidFromSurplus
    )
      return;
    if ((env.ctx.landing.get(e.lineItemId) ?? CHECKING) !== CHECKING) return;
    const key = paymentKey.bill(e.lineItemId, date);
    const chosen = set[key];
    events.push({
      date: chosen?.on ?? (date < today ? today : date),
      cents: -(chosen?.cents ?? e.budgetedCents),
      kind: "bill",
      name: e.name,
      ...(choices.some((c) => c.key === key) ? { key } : {}),
    });
  };
  views.forEach((v, i) => {
    for (const e of v.income) add(e);
    for (const e of [...v.halves[0].entries, ...v.halves[1].entries]) add(e);
    if (i === 0) for (const e of v.carried) add(e);
  });
  for (const c of choices.filter((x) => x.cycle === "closed")) {
    const left = Math.max(0, c.fullCents - c.paidCents);
    const cents = c.set?.cents ?? left;
    if (cents > 0)
      events.push({
        date: c.set?.on ?? (c.dueOn < today ? today : c.dueOn),
        cents: -cents,
        kind: "card",
        name: c.name,
        key: c.key,
      });
  }
  for (const t of terms) {
    // Each card's open statement, at its plan, when it's due before the horizon.
    const close = nextClose(t.st.lastClose);
    const due = dueAfter(t.st.nextDue, close);
    if (!due || due > horizon) continue;
    const key = paymentKey.card(t.st.id, close);
    const cents = await statementDueIn(env, t.st, t.closeDay, due.slice(0, 7));
    if (cents)
      events.push({
        date: set[key]?.on ?? due,
        cents: -cents,
        kind: "card",
        name: t.st.name,
        ...(choices.some((c) => c.key === key) ? { key } : {}),
      });
  }
  for (const st of promo) {
    let first = true;
    for (let d = st.nextDue; d <= horizon; d = addMonth(d)) {
      if (first) {
        const c = choices.find(
          (x) => x.key === paymentKey.debt(st.id, st.nextDue),
        )!;
        const cents = c.set?.cents ?? Math.max(0, c.fullCents - c.paidCents);
        if (cents > 0 && d >= addDays(today, -3))
          events.push({
            date: c.set?.on ?? (d < today ? today : d),
            cents: -cents,
            kind: "debt",
            name: st.name,
            key: c.key,
          });
        first = false;
      } else if (debtCents > 0)
        events.push({
          date: d,
          cents: -debtCents,
          kind: "debt",
          name: st.name,
        });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents);

  // ---- The month ledgers, one per month a payment is due in.
  const { extraToDebtSetting } = await import("./envelopes");
  const { loadPaydays } = await import("./pay-split");
  const extraToDebt = await extraToDebtSetting();
  const paydays = await loadPaydays();
  const byId = new Map(items.map((i) => [i.id, i]));
  const amount = (e: MonthEntry) => e.actualCents ?? e.budgetedCents;
  const ledgers: Record<string, MonthLedger> = {};
  for (const ym of [...new Set(choices.map((c) => c.month))]) {
    const v = await env.view(ym);
    const frequency = paydays.frequency(
      Number(ym.slice(0, 4)),
      Number(ym.slice(5, 7)),
    );
    const payCents = v.income
      .filter((e) => !e.skipped)
      .filter((e) => {
        const i = byId.get(e.lineItemId);
        return !(
          extraToDebt &&
          i &&
          isExtraIncome(
            { ...i, plannedCents: toCents(i.plannedAmount) },
            frequency,
          )
        );
      })
      .reduce((t, e) => t + amount(e), 0);
    const bills = [...v.halves[0].entries, ...v.halves[1].entries].filter(
      (e) =>
        e.kind === "BILL" &&
        !e.skipped &&
        !e.carriedFrom &&
        !e.paidFromSurplus &&
        !isCardPayment(e.lineItemId) &&
        !isDebt(e.lineItemId) &&
        (env.ctx.landing.get(e.lineItemId) ?? CHECKING) === CHECKING,
    );
    const choiceBills: Record<string, number> = {};
    for (const e of bills) {
      const key = paymentKey.bill(
        e.lineItemId,
        dueIso(e.year, e.month, e.dueDay),
      );
      if (choices.some((c) => c.key === key)) choiceBills[key] = amount(e);
    }
    const cards: Record<string, number> = {};
    for (const t of terms)
      cards[t.st.id] = (await statementDueIn(env, t.st, t.closeDay, ym)) ?? 0;
    ledgers[ym] = {
      month: ym,
      payCents,
      billsCents: bills.reduce((t, e) => t + amount(e), 0),
      debtCents: promo.length ? debtCents : 0,
      cards,
      choiceBills,
    };
  }

  // ---- The periods: this month, and the open cycle of each card planned by cycle.
  const checking = {
    cents: views[0].billsBalanceCents,
    asOf: views[0].billsBalanceAsOf ?? null,
  };
  const periods: PeriodSummary[] = [
    periodSummary(
      env,
      plan,
      "Month",
      monthStart(plan.month),
      monthEnd(plan.month),
      views,
      events,
      checking.cents,
      isCardPayment,
      isDebt,
      promo,
      debtCents,
    ),
  ];
  for (const st of regular.filter((s) => cycleCards.has(s.id))) {
    periods.push(
      periodSummary(
        env,
        plan,
        `${st.name} cycle`,
        addDays(st.lastClose, 1),
        nextClose(st.lastClose),
        views,
        events,
        checking.cents,
        isCardPayment,
        isDebt,
        promo,
        debtCents,
      ),
    );
  }
  const filled = await Promise.all(
    periods.map((p) => fillPeriod(env, p, today)),
  );

  // ---- Checking's average over each of the last six periods (cycles, or months).
  const spans: Array<{ from: string; to: string }> = [];
  const cycleCard = regular.find((s) => cycleCards.has(s.id));
  const closeDay = cycleCard
    ? (bankCards.find((c) => c.id === cycleCard.id)?.statementCloseDay ?? null)
    : null;
  let end =
    cycleCard && closeDay
      ? cycleCard.lastClose
      : addDays(monthStart(today.slice(0, 7)), -1);
  for (let i = 0; i < 6; i++) {
    const from =
      cycleCard && closeDay
        ? windowClosing(end, closeDay).from
        : monthStart(end.slice(0, 7));
    spans.unshift({ from, to: end });
    end = addDays(from, -1);
  }
  const hist = await checkingHistory(spans[0].from, today).catch(() => null);
  const checkingHist = hist
    ? spans.map((sp) => {
        const days = hist.days.filter(
          (d) => d.date >= sp.from && d.date <= sp.to,
        );
        return {
          on: sp.to,
          cents: days.length
            ? Math.round(
                days.reduce((t, d) => t + d.balanceCents, 0) / days.length,
              )
            : hist.startCents,
        };
      })
    : [];

  return {
    today,
    checking,
    choices,
    ledgers,
    events,
    periods: filled,
    checkingHistory: checkingHist,
    changes: await budgetChanges(env).catch(() => []),
  };
}

/** The period's planned and projected figures that don't need the database. */
function periodSummary(
  env: Env,
  plan: MonthPlanView,
  label: string,
  from: string,
  to: string,
  views: Awaited<ReturnType<Env["view"]>>[],
  events: CashEvent[],
  checkingNow: number | null,
  isCardPayment: (id: string) => boolean,
  isDebt: (id: string) => boolean,
  promo: Array<{ nextDue: string }>,
  debtCents: number,
): PeriodSummary {
  const today = plan.today;
  const inRange = (d: string) => d >= from && d <= to;
  let incomePlan = 0,
    incomeActual = 0,
    billsPlan = 0,
    billsActual = 0,
    billsLeft = 0;
  const seen = new Set<string>();
  for (const v of views) {
    for (const e of v.income) {
      const d = dueIso(e.year, e.month, e.dueDay);
      if (e.skipped || !inRange(d) || seen.has(`i${e.lineItemId}${d}`))
        continue;
      seen.add(`i${e.lineItemId}${d}`);
      incomePlan += e.budgetedCents;
      incomeActual += e.actualCents ?? 0;
    }
    for (const e of [...v.halves[0].entries, ...v.halves[1].entries]) {
      const d = dueIso(e.year, e.month, e.dueDay);
      if (
        e.kind !== "BILL" ||
        e.skipped ||
        e.carriedFrom ||
        !inRange(d) ||
        isCardPayment(e.lineItemId) ||
        isDebt(e.lineItemId) ||
        seen.has(`b${e.lineItemId}${d}`)
      )
        continue;
      seen.add(`b${e.lineItemId}${d}`);
      billsPlan += e.budgetedCents;
      billsActual += e.actualCents ?? 0;
      if (e.actualCents === null) billsLeft += e.budgetedCents;
    }
  }
  // Pay still to come in the period (incomeActual counts what's arrived).
  const payLeft = events
    .filter((e) => e.kind === "pay" && inRange(e.date))
    .reduce((t, e) => t + e.cents, 0);
  let debtDates = 0;
  for (const st of promo) {
    // Step back to the first due date in the period, then count forward.
    let d = st.nextDue;
    for (let i = 0; i < 3 && d > from; i++) d = addMonth(d, -1);
    for (; d <= to; d = addMonth(d)) if (d >= from) debtDates++;
  }
  // Checking at the end: now, plus everything that moves before the period ends.
  const checkingOut =
    checkingNow === null || to < today
      ? null
      : checkingNow +
        events.filter((e) => e.date <= to).reduce((t, e) => t + e.cents, 0);
  return {
    label,
    from,
    to,
    checkingInCents: null,
    checkingOutCents: checkingOut,
    rows: [
      {
        key: "INCOME",
        plannedCents: incomePlan,
        actualCents: incomeActual,
        projectedCents: incomeActual + payLeft,
      },
      {
        key: "BILLS",
        plannedCents: billsPlan,
        actualCents: billsActual,
        projectedCents: billsActual + billsLeft,
      },
      {
        key: "DEBT",
        plannedCents: debtDates * debtCents,
        actualCents: 0,
        projectedCents: debtDates * debtCents,
      },
      { key: "ESSENTIAL", plannedCents: 0, actualCents: 0, projectedCents: 0 },
      { key: "FLEXIBLE", plannedCents: 0, actualCents: 0, projectedCents: 0 },
      { key: "UNPLANNED", plannedCents: 0, actualCents: 0, projectedCents: 0 },
    ],
  };
}

/** Spending budgets and spending for the period (every account), the 0% payments made, and checking at the start. */
async function fillPeriod(
  env: Env,
  p: PeriodSummary,
  today: string,
): Promise<PeriodSummary> {
  const { plan } = env;
  const budgeted = plan.groups.filter(
    (g) =>
      (g.tier === "ESSENTIAL" || g.tier === "FLEXIBLE") &&
      (g.limitCents ?? 0) > 0,
  );
  const unplannedIds = new Set(
    plan.groups
      .filter((g) => g.tier === "UNPLANNED" || g.tier === "SORT")
      .map((g) => g.id),
  );
  const planned = { ESSENTIAL: 0, FLEXIBLE: 0, UNPLANNED: 0 };
  for (let ym = p.from.slice(0, 7); ym <= p.to.slice(0, 7); ym = nextYm(ym)) {
    const pFrom = p.from > monthStart(ym) ? p.from : monthStart(ym);
    const pTo = p.to < monthEnd(ym) ? p.to : monthEnd(ym);
    const rule = pTo === monthEnd(ym) && ym <= plan.month ? "left" : "days";
    const before =
      rule === "left" && pFrom > monthStart(ym)
        ? (await env.spending(monthStart(ym), addDays(pFrom, -1), null)).byGroup
        : new Map<string, number>();
    const r = portionBudget({
      rule,
      budgets: budgeted.map((g) => ({
        id: g.id,
        tier: g.tier as "ESSENTIAL" | "FLEXIBLE",
        limitCents: g.limitCents ?? 0,
        share: 1,
      })),
      before,
      fraction:
        daysBetween(pFrom, pTo) / daysBetween(monthStart(ym), monthEnd(ym)),
      reserveCents: env.reserveCents,
      unplannedBeforeCents: [...before]
        .filter(([g]) => unplannedIds.has(g))
        .reduce((t, [, c]) => t + c, 0),
    });
    planned.ESSENTIAL += r.essentialCents;
    planned.FLEXIBLE += r.extrasCents;
    planned.UNPLANNED += r.reserveCents;
  }
  const spentTo = p.to < today ? p.to : today;
  const spent =
    p.from <= today
      ? await env.spending(p.from, spentTo, null)
      : { byGroup: new Map<string, number>(), billCharges: 0, charged: 0 };
  const actual = { ESSENTIAL: 0, FLEXIBLE: 0, UNPLANNED: 0 };
  for (const [g, c] of spent.byGroup) {
    const t = env.tierOf.get(g);
    if (t === "ESSENTIAL") actual.ESSENTIAL += c;
    else if (t === "FLEXIBLE") actual.FLEXIBLE += c;
    else actual.UNPLANNED += c;
  }
  const days = daysBetween(p.from, p.to);
  const elapsed = Math.max(1, Math.min(days, daysBetween(p.from, today)));
  const pace = (c: number) => Math.round((c * days) / elapsed);
  // Essentials and the reserve get used: at least their budget. Extras go at their pace.
  const projected = {
    ESSENTIAL: Math.max(
      planned.ESSENTIAL,
      actual.ESSENTIAL,
      elapsed >= days ? actual.ESSENTIAL : 0,
    ),
    FLEXIBLE:
      elapsed >= days
        ? actual.FLEXIBLE
        : Math.max(actual.FLEXIBLE, pace(actual.FLEXIBLE)),
    UNPLANNED: Math.max(planned.UNPLANNED, actual.UNPLANNED),
  };
  // 0% payments made in the period.
  const promoIds = (await prisma.bankAccount.findMany({
    where: {
      type: "CREDIT_CARD",
      hidden: false,
      promoEndsOn: { gte: new Date(`${today}T00:00:00Z`) },
    },
    select: { id: true },
  })) as Array<{ id: string }>;
  let debtPaid = 0;
  for (const c of promoIds) debtPaid += await paymentsTo(c.id, p.from, spentTo);
  const hist =
    p.from <= today
      ? await checkingHistory(addDays(p.from, -1), today).catch(() => null)
      : null;
  const checkingIn = hist
    ? (hist.days[0]?.balanceCents ?? hist.startCents)
    : null;
  const rows = p.rows.map((r) => {
    if (r.key === "DEBT")
      return {
        ...r,
        actualCents: debtPaid,
        projectedCents: Math.max(r.projectedCents, debtPaid),
      };
    if (r.key === "ESSENTIAL" || r.key === "FLEXIBLE" || r.key === "UNPLANNED")
      return {
        ...r,
        plannedCents: planned[r.key],
        actualCents: actual[r.key],
        projectedCents: projected[r.key],
      };
    return r;
  });
  return { ...p, rows, checkingInCents: checkingIn };
}
