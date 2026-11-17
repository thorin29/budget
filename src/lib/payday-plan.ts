/**
 * The payday plan: what to do with a paycheck. Pure: the server gathers the
 * balance, the bills, the debt payment and the cards.
 *
 *   1. Send the debt payment.
 *   2. Hold back the bills due before the next payday.
 *   3. Send the rest to the cards, soonest due first: each card's statement
 *      first, then the rest of its balance, so it reaches zero if there's
 *      enough. A small cushion stays in checking.
 */

export interface PlanCard {
  id: string;
  name: string;
  color: string | null;
  /** YYYY-MM-DD */
  dueOn: string;
  /** Left of the last statement to pay by the due date. */
  statementCents: number;
  /** Everything owed now. */
  owedCents: number;
}

export interface PaydayPlanInput {
  checkingCents: number;
  /** Bills due before the next payday that aren't paid yet. */
  bills: Array<{ name: string; dueOn: string; cents: number }>;
  debtCents: number;
  cards: PlanCard[];
  /** Left in checking after everything, for surprises. */
  cushionCents: number;
}

export interface PaydayPlan {
  checkingCents: number;
  holdCents: number;
  debtCents: number;
  cushionCents: number;
  /** What can go to the cards. Negative when the bills and debt payment alone need more than checking has. */
  forCardsCents: number;
  cards: Array<PlanCard & { sendCents: number; result: "zero" | "statement" | "short" | "none" }>;
  /** Owed on the cards after these payments. */
  leftOnCardsCents: number;
  /** In checking after the payments and once the held bills are paid. */
  afterCents: number;
}

export function paydayPlan(input: PaydayPlanInput): PaydayPlan {
  const holdCents = input.bills.reduce((s, b) => s + Math.max(0, b.cents), 0);
  const forCards = input.checkingCents - holdCents - input.debtCents - input.cushionCents;
  let left = Math.max(0, forCards);
  const sorted = [...input.cards].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const send = new Map<string, number>();
  // Statements first, so nothing is late; then balances, soonest due first.
  for (const c of sorted) {
    const s = Math.min(left, Math.max(0, c.statementCents));
    send.set(c.id, s);
    left -= s;
  }
  for (const c of sorted) {
    const more = Math.min(left, Math.max(0, c.owedCents - (send.get(c.id) ?? 0)));
    send.set(c.id, (send.get(c.id) ?? 0) + more);
    left -= more;
  }
  const cards = sorted.map((c) => {
    const sendCents = send.get(c.id) ?? 0;
    const result: "zero" | "statement" | "short" | "none" =
      c.owedCents <= 0 ? "none" : sendCents >= c.owedCents ? "zero" : sendCents >= c.statementCents ? "statement" : "short";
    return { ...c, sendCents, result };
  });
  const sent = cards.reduce((s, c) => s + c.sendCents, 0);
  return {
    checkingCents: input.checkingCents,
    holdCents,
    debtCents: input.debtCents,
    cushionCents: input.cushionCents,
    forCardsCents: forCards,
    cards,
    leftOnCardsCents: cards.reduce((s, c) => s + Math.max(0, c.owedCents - c.sendCents), 0),
    afterCents: input.checkingCents - holdCents - input.debtCents - sent,
  };
}
