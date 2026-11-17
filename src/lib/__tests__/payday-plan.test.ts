import { describe, expect, it } from "vitest";
import { paydayPlan } from "../payday-plan";

const card = (id: string, dueOn: string, statementCents: number, owedCents: number) => ({ id, name: id, color: null, dueOn, statementCents, owedCents });

describe("payday plan", () => {
  it("holds bills and the debt payment, then pays statements, then balances, soonest due first", () => {
    const p = paydayPlan({
      checkingCents: 600_000,
      bills: [{ name: "Water", dueOn: "2026-11-16", cents: 30_000 }, { name: "Insurance", dueOn: "2026-11-23", cents: 33_000 }],
      debtCents: 12_900,
      cards: [card("b", "2026-12-10", 100_000, 250_000), card("a", "2026-12-09", 30_000, 51_000)],
      cushionCents: 20_000,
    });
    expect(p.holdCents).toBe(63_000);
    expect(p.forCardsCents).toBe(600_000 - 63_000 - 12_900 - 20_000);
    expect(p.cards.map((c) => c.id)).toEqual(["a", "b"]);
    expect(p.cards[0]).toMatchObject({ sendCents: 51_000, result: "zero" });
    expect(p.cards[1]).toMatchObject({ sendCents: 250_000, result: "zero" });
    expect(p.leftOnCardsCents).toBe(0);
    expect(p.afterCents).toBe(600_000 - 63_000 - 12_900 - 301_000);
    // Less money: the later card gets its statement and part of the rest.
    const q = paydayPlan({ checkingCents: 300_000, bills: [], debtCents: 0, cards: [card("b", "2026-12-10", 100_000, 250_000), card("a", "2026-12-09", 30_000, 51_000)], cushionCents: 0 });
    expect(q.cards.map((c) => [c.id, c.sendCents, c.result])).toEqual([["a", 51_000, "zero"], ["b", 249_000, "statement"]]);
  });

  it("says when a statement can't be covered", () => {
    const p = paydayPlan({ checkingCents: 100_000, bills: [{ name: "Mortgage", dueOn: "2026-12-01", cents: 90_000 }], debtCents: 0, cards: [card("a", "2026-12-09", 30_000, 30_000)], cushionCents: 5_000 });
    expect(p.forCardsCents).toBe(5_000);
    expect(p.cards[0]).toMatchObject({ sendCents: 5_000, result: "short" });
    expect(p.leftOnCardsCents).toBe(25_000);
  });

  it("goes negative when the bills alone need more than checking has", () => {
    const p = paydayPlan({ checkingCents: 50_000, bills: [{ name: "Mortgage", dueOn: "2026-12-01", cents: 90_000 }], debtCents: 0, cards: [], cushionCents: 0 });
    expect(p.forCardsCents).toBe(-40_000);
    expect(p.afterCents).toBe(-40_000);
  });
});
