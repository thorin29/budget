// Cards, categories and amounts here are invented.
import { describe, expect, it } from "vitest";
import { budgetPlan, type CardInput } from "../budget-plan";

const card = (id: string, bills: number, spending: number, since: { bills: number; spending: number }): CardInput => ({
  id, name: id, color: null, billsCents: bills, recentSpending: [spending, spending, spending], recentBills: [bills, bills, bills],
  periodFrom: "2026-11-11", periodIsStatement: true, sinceBillsCents: since.bills, sinceSpendingCents: since.spending, balanceCents: since.bills + since.spending,
});

describe("budgetPlan", () => {
  const plan = budgetPlan({
    incomeCents: 900_000,
    incomeSource: "plan",
    bankBillsCents: 350_000,
    payoffCents: 100_000,
    recentDebit: [50_000, 50_000, 50_000],
    recentOtherCards: [0, 0, 0],
    cards: [card("A", 80_000, 300_000, { bills: 30_000, spending: 250_000 }), card("B", 0, 100_000, { bills: 0, spending: 20_000 })],
    categories: [
      { id: "g", name: "Groceries", recent: [120_000], monthCents: 60_000 },
      { id: "d", name: "Dining", recent: [150_000], monthCents: 70_000 },
      { id: "s", name: "Shopping", recent: [150_000], monthCents: 40_000 },
    ],
    monthSpentCents: 170_000,
    day: 16,
    daysInMonth: 30,
  });

  it("shows where the income goes, with the shortfall past the end", () => {
    expect(plan.bar).toEqual({ bankBillsCents: 350_000, cardBillsCents: 80_000, cardSpendingCents: 400_000, debitSpendingCents: 50_000, payoffCents: 100_000, leftOverCents: -80_000 });
  });

  it("sets a card budget and shares the spending room by how each card is used", () => {
    // 900 − 350 bank bills − 50 debit − 100 payoff = 400 for cards; 80 of it bills, 320 to spend.
    expect(plan.cardBudget).toMatchObject({ totalCents: 400_000, billsCents: 80_000, spendingCents: 320_000 });
    const [a, b] = plan.cardBudget.cards;
    expect(a).toMatchObject({ spendingBudgetCents: 240_000, budgetCents: 320_000, billsToComeCents: 50_000, leftCents: -10_000 });
    expect(b).toMatchObject({ spendingBudgetCents: 80_000, leftCents: 60_000 });
  });

  it("holds essentials and scales flexible categories to fit", () => {
    // Everyday budget: 900 − 350 − 80 − 100 = 370; groceries keep 120, flexible get 250 of their usual 300.
    expect(plan.categoryTargets.everydayBudgetCents).toBe(370_000);
    const t = Object.fromEntries(plan.categoryTargets.rows.map((r) => [r.name, r.targetCents]));
    expect(t).toEqual({ Groceries: 120_000, Dining: 125_000, Shopping: 125_000 });
    expect(plan.categoryTargets.rows[0].essential).toBe(true);
  });
});
