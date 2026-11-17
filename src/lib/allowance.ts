/**
 * The big picture: how much can go to everyday spending (cards and debit
 * together) each month and still keep within the plan.
 *
 *   limit = typical monthly income − fixed bills − 0% payoff payments
 *
 * Income and bills are averaged over twelve months of the plan, so a yearly
 * bill or a three-paycheck month counts for its share. Card payments are left
 * out of the bills: they pay for the everyday spending this limit is about,
 * and counting both would count the spending twice. Pure: the server gathers
 * the plan and the spending.
 */

export interface PlanRow {
  name: string;
  kind: "BILL" | "SETTLEMENT" | "INCOME";
  /** Budgeted amount in each of the twelve months (0 when not due). */
  months: number[];
  /** Pays a credit card (linked, a card payoff, or paid from what's left). */
  cardPayment: boolean;
}

export interface AllowanceInput {
  rows: PlanRow[];
  /** Monthly payments that clear 0% balances on time. */
  payoffCents: number;
  /** Average deposits over the last complete months, used when the plan has no income. */
  depositsCents?: number;
  /** Everyday spending in each of the last three complete months. */
  recentEveryday: number[];
  /** Of that, how much went on cards, per month. */
  recentOnCards: number[];
  /** The month in progress. */
  spentCents: number;
  projectedCents: number | null;
  day: number;
  daysInMonth: number;
}

export interface Allowance {
  incomeCents: number;
  /** "plan": income line items. "bank": the plan has none, so recent deposits. */
  incomeSource: "plan" | "bank";
  fixedBillsCents: number;
  payoffCents: number;
  /** The most everyday spending can be each month and keep within the plan. */
  limitCents: number;
  /** What everyday spending has averaged over the last three complete months. */
  averageCents: number;
  /** Positive: how far over the limit that average runs. */
  overCents: number;
  averageOnCardsCents: number;
  /** Card payments in the plan, shown so it's clear they aren't counted twice. */
  cardPaymentNames: string[];
  thisMonth: {
    spentCents: number;
    leftCents: number;
    /** What's left spread over the rest of the month, per week. */
    perWeekLeftCents: number;
    projectedCents: number | null;
    daysLeft: number;
  };
}

const avg12 = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / 12);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export function allowance(input: AllowanceInput): Allowance {
  const planned = input.rows.filter((r) => r.kind === "INCOME").reduce((s, r) => s + avg12(r.months), 0);
  const incomeSource = planned > 0 || !input.depositsCents ? "plan" : "bank";
  const incomeCents = incomeSource === "plan" ? planned : input.depositsCents!;
  const fixedBillsCents = input.rows.filter((r) => r.kind !== "INCOME" && !r.cardPayment).reduce((s, r) => s + avg12(r.months), 0);
  const limitCents = incomeCents - fixedBillsCents - input.payoffCents;
  const averageCents = avg(input.recentEveryday);
  const leftCents = limitCents - input.spentCents;
  const daysLeft = Math.max(0, input.daysInMonth - input.day + 1);
  return {
    incomeCents,
    incomeSource,
    fixedBillsCents,
    payoffCents: input.payoffCents,
    limitCents,
    averageCents,
    overCents: averageCents - limitCents,
    averageOnCardsCents: avg(input.recentOnCards),
    cardPaymentNames: input.rows.filter((r) => r.kind !== "INCOME" && r.cardPayment).map((r) => r.name),
    thisMonth: {
      spentCents: input.spentCents,
      leftCents,
      perWeekLeftCents: daysLeft > 0 ? Math.round((Math.max(0, leftCents) / daysLeft) * 7) : 0,
      projectedCents: input.projectedCents,
      daysLeft,
    },
  };
}
