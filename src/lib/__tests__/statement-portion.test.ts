import { describe, expect, it } from "vitest";
import { portionBudget, spread } from "../statement-portion";

// Invented amounts.
const budgets = [
  { id: "food", tier: "ESSENTIAL" as const, limitCents: 90_000, share: 1 },
  { id: "gas", tier: "ESSENTIAL" as const, limitCents: 20_000, share: 0.5 },
  { id: "fun", tier: "FLEXIBLE" as const, limitCents: 30_000, share: 1 },
  { id: "dine", tier: "FLEXIBLE" as const, limitCents: 10_000, share: 1 },
];

describe("portionBudget", () => {
  it("the end of a month is what the month has left, at the card's share", () => {
    const r = portionBudget({ rule: "left", budgets, before: new Map([["food", 40_000], ["gas", 8_000]]), fraction: 0, reserveCents: 25_000, unplannedBeforeCents: 7_000 });
    expect(r.essentialCents).toBe(50_000 + 6_000);
    expect(r.extrasCents).toBe(40_000);
    expect(r.reserveCents).toBe(18_000);
    expect([...r.byGroup.values()].reduce((a, b) => a + b, 0)).toBe(96_000);
  });

  it("pools a section: one budget over takes from the others, never below zero", () => {
    const r = portionBudget({ rule: "left", budgets, before: new Map([["fun", 36_000], ["dine", 1_000]]), fraction: 0, reserveCents: 0, unplannedBeforeCents: 0 });
    expect(r.extrasCents).toBe(3_000);
    expect(r.byGroup.get("dine")).toBe(3_000);
    expect(r.byGroup.has("fun")).toBe(false);
    const gone = portionBudget({ rule: "left", budgets, before: new Map([["fun", 45_000]]), fraction: 0, reserveCents: 5_000, unplannedBeforeCents: 9_000 });
    expect(gone.extrasCents).toBe(0);
    expect(gone.reserveCents).toBe(0);
  });

  it("the start of a month is the limits by days", () => {
    const r = portionBudget({ rule: "days", budgets, before: new Map([["food", 99_999]]), fraction: 15 / 30, reserveCents: 30_000, unplannedBeforeCents: 9_999 });
    expect(r.essentialCents).toBe(45_000 + 5_000);
    expect(r.extrasCents).toBe(20_000);
    expect(r.reserveCents).toBe(15_000);
  });
});

describe("spread", () => {
  it("adds up exactly", () => {
    const s = spread(1_000, new Map([["a", 1], ["b", 1], ["c", 1], ["d", -5]]));
    expect([...s.values()].reduce((a, b) => a + b, 0)).toBe(1_000);
    expect(s.has("d")).toBe(false);
  });
});
