/**
 * A balanced budget, from the top down. Pure: the server gathers the numbers.
 *
 *  1. Where the income goes: typical monthly income as the whole bar, split
 *     into bills paid from the bank, bills on cards, card spending, debit and
 *     other spending, and the 0% payoff. Bills come from the plan; spending is
 *     what the last three complete months averaged. What's past the end of the
 *     bar is the shortfall.
 *  2. Card budget: what can go on the cards each month, which is income less
 *     bank bills, debit spending and the payoff. Each card gets its bills plus
 *     a share of the spending room in proportion to how it has been used, and
 *     shows, since its statement closed, how much of the balance is bills and
 *     how much is spending, and the spending room left.
 *  3. Category targets: the everyday budget (income less every bill and the
 *     payoff) shared out. Essentials keep their usual amount; flexible
 *     categories are scaled down together to fit what's left.
 */

export const ESSENTIAL = /^(phone|cell phone|housing|loans|groceries|grocery|food|costco & sam's club|warehouse clubs?|fuel|gas|gasoline|medical|health|healthcare|medical & health|utilities|utility|insurance|pets?)$/i;

export interface CardInput {
  id: string;
  name: string;
  color: string | null;
  /** Bills from the plan charged to this card, per month. */
  billsCents: number;
  /** Everyday spending on this card in each of the last three complete months. */
  recentSpending: number[];
  /** Bill charges on this card in each of the last three complete months. */
  recentBills: number[];
  /** Since the statement closed (or the month began, without a closing day). YYYY-MM-DD */
  periodFrom: string;
  periodIsStatement: boolean;
  sinceBillsCents: number;
  sinceSpendingCents: number;
  balanceCents: number;
}

export interface CategoryInput {
  id: string | null;
  name: string;
  /** Everyday spending in each of the last three complete months. */
  recent: number[];
  monthCents: number;
}

export interface BudgetInput {
  incomeCents: number;
  incomeSource: "plan" | "bank";
  /** Plan bills (not card payments), per month, by where they're paid. */
  bankBillsCents: number;
  /** Monthly payments that clear 0% balances on time. */
  payoffCents: number;
  /** Everyday spending from checking in each of the last three complete months. */
  recentDebit: number[];
  /** Everyday spending on cards outside the budget (0% cards) in those months. */
  recentOtherCards: number[];
  cards: CardInput[];
  categories: CategoryInput[];
  /** Everyday spending so far this month, all accounts. */
  monthSpentCents: number;
  day: number;
  daysInMonth: number;
}

export interface BudgetPlan {
  incomeCents: number;
  incomeSource: "plan" | "bank";
  /** The bar: each part per month. `leftOverCents` is negative when spending runs past income. */
  bar: {
    bankBillsCents: number;
    cardBillsCents: number;
    cardSpendingCents: number;
    debitSpendingCents: number;
    payoffCents: number;
    leftOverCents: number;
  };
  cardBudget: {
    /** What can go on the budget cards each month, bills included. */
    totalCents: number;
    billsCents: number;
    /** Of that, the room for spending. */
    spendingCents: number;
    /** What the cards averaged, bills and spending, over the last three months. */
    averageCents: number;
    cards: Array<{
      id: string;
      name: string;
      color: string | null;
      budgetCents: number;
      billsCents: number;
      spendingBudgetCents: number;
      averageSpendingCents: number;
      averageBillsCents: number;
      periodFrom: string;
      periodIsStatement: boolean;
      sinceBillsCents: number;
      sinceSpendingCents: number;
      /** Plan bills not charged yet this period. */
      billsToComeCents: number;
      /** Spending room left this period; negative when over. */
      leftCents: number;
      balanceCents: number;
    }>;
  };
  categoryTargets: {
    /** Income less every bill and the payoff: all everyday spending, cards and debit. */
    everydayBudgetCents: number;
    monthSpentCents: number;
    leftCents: number;
    perWeekLeftCents: number;
    /** Flexible categories' targets as a share of their usual (1 = no cut). */
    flexibleScale: number;
    rows: Array<{ id: string | null; name: string; essential: boolean; averageCents: number; targetCents: number; monthCents: number }>;
  };
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export function budgetPlan(input: BudgetInput): BudgetPlan {
  const cardBills = input.cards.reduce((s, c) => s + c.billsCents, 0);
  const cardSpendingAvg = input.cards.reduce((s, c) => s + avg(c.recentSpending), 0) + avg(input.recentOtherCards);
  const debitAvg = avg(input.recentDebit);
  const bar = {
    bankBillsCents: input.bankBillsCents,
    cardBillsCents: cardBills,
    cardSpendingCents: cardSpendingAvg,
    debitSpendingCents: debitAvg,
    payoffCents: input.payoffCents,
    leftOverCents: 0,
  };
  bar.leftOverCents = input.incomeCents - bar.bankBillsCents - bar.cardBillsCents - bar.cardSpendingCents - bar.debitSpendingCents - bar.payoffCents;

  // 2. The cards.
  const total = input.incomeCents - input.bankBillsCents - debitAvg - input.payoffCents - avg(input.recentOtherCards);
  const room = Math.max(0, total - cardBills);
  const used = input.cards.map((c) => avg(c.recentSpending));
  const usedTotal = used.reduce((a, b) => a + b, 0);
  const cards = input.cards.map((c, i) => {
    const share = usedTotal > 0 ? used[i] / usedTotal : 1 / input.cards.length;
    const spendingBudgetCents = Math.round(room * share);
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      budgetCents: c.billsCents + spendingBudgetCents,
      billsCents: c.billsCents,
      spendingBudgetCents,
      averageSpendingCents: used[i],
      averageBillsCents: avg(c.recentBills),
      periodFrom: c.periodFrom,
      periodIsStatement: c.periodIsStatement,
      sinceBillsCents: c.sinceBillsCents,
      sinceSpendingCents: c.sinceSpendingCents,
      billsToComeCents: Math.max(0, c.billsCents - c.sinceBillsCents),
      leftCents: spendingBudgetCents - c.sinceSpendingCents,
      balanceCents: c.balanceCents,
    };
  });

  // 3. Categories.
  const everydayBudget = input.incomeCents - input.bankBillsCents - cardBills - input.payoffCents;
  const rows = input.categories.map((c) => ({ ...c, essential: c.id !== null && ESSENTIAL.test(c.name.trim()), averageCents: avg(c.recent) }));
  const essentials = rows.filter((r) => r.essential).reduce((s, r) => s + r.averageCents, 0);
  const flexibleAvg = rows.filter((r) => !r.essential).reduce((s, r) => s + r.averageCents, 0);
  const flexibleRoom = Math.max(0, everydayBudget - essentials);
  const flexibleScale = flexibleAvg > 0 ? Math.min(1, flexibleRoom / flexibleAvg) : 1;
  const daysLeft = Math.max(0, input.daysInMonth - input.day + 1);
  const leftCents = everydayBudget - input.monthSpentCents;

  return {
    incomeCents: input.incomeCents,
    incomeSource: input.incomeSource,
    bar,
    cardBudget: {
      totalCents: total,
      billsCents: cardBills,
      spendingCents: room,
      averageCents: cardBills > 0 || cardSpendingAvg > 0 ? input.cards.reduce((s, c) => s + avg(c.recentSpending) + avg(c.recentBills), 0) : 0,
      cards,
    },
    categoryTargets: {
      everydayBudgetCents: everydayBudget,
      monthSpentCents: input.monthSpentCents,
      leftCents,
      perWeekLeftCents: daysLeft > 0 ? Math.round((Math.max(0, leftCents) / daysLeft) * 7) : 0,
      flexibleScale,
      rows: rows
        .map((r) => ({
          id: r.id,
          name: r.name,
          essential: r.essential,
          averageCents: r.averageCents,
          targetCents: r.essential ? r.averageCents : Math.round(r.averageCents * flexibleScale),
          monthCents: r.monthCents,
        }))
        .filter((r) => r.averageCents > 0 || r.monthCents > 0)
        .sort((a, b) => Number(b.essential) - Number(a.essential) || b.averageCents - a.averageCents),
    },
  };
}
