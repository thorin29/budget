import { describe, expect, it } from "vitest";
import { monthPlan, whatIf, type MonthPlanIn } from "../month-plan";

// A made-up month with a $3,300 pool: $5,000 in, $1,420 of bills, $280 debt payment.
const base: MonthPlanIn = {
  incomeCents: 500_000,
  billsCents: 142_000,
  debtCents: 28_000,
  groups: [
    { id: "groceries", tier: "ESSENTIAL", manualCents: 160_000, usualCents: 0, spentCents: 20_000 },
    { id: "fuel", tier: "ESSENTIAL", manualCents: 50_000, usualCents: 0, spentCents: 6_000 },
    { id: "household", tier: "ESSENTIAL", manualCents: 30_000, usualCents: 0, spentCents: 0 },
    { id: "eating", tier: "FLEXIBLE", manualCents: 40_000, usualCents: 0, spentCents: 0 },
    { id: "shopping", tier: "FLEXIBLE", manualCents: 30_000, usualCents: 0, spentCents: 0 },
    { id: "fun", tier: "FLEXIBLE", manualCents: 20_000, usualCents: 0, spentCents: 0 },
    { id: "repairs", tier: "UNPLANNED", manualCents: null, usualCents: 30_000, spentCents: 0 },
  ],
};
const room = (out: ReturnType<typeof monthPlan>, id: string) => out.groups.find((g) => g.id === id)!.roomCents;

describe("monthPlan", () => {
  it("day 2: the pool looks big, but essentials still to come are held back", () => {
    const out = monthPlan(base);
    expect(out.poolCents).toBe(330_000);
    expect(out.poolLeftCents).toBe(304_000);
    expect(out.stillToComeCents).toBe(214_000);
    expect(out.safeCents).toBe(90_000);
    expect([room(out, "eating"), room(out, "shopping"), room(out, "fun")]).toEqual([40_000, 30_000, 20_000]);
  });

  it("what if: eating out, ice cream and a hockey stick", () => {
    const out = whatIf(base, [
      { groupId: "eating", cents: 8_000 },
      { groupId: "eating", cents: 2_000 },
      { groupId: "shopping", cents: 25_000 },
    ]);
    expect(out.safeCents).toBe(55_000);
    expect([room(out, "eating"), room(out, "shopping"), room(out, "fun")]).toEqual([30_000, 5_000, 20_000]);
  });

  it("an unplanned repair takes every budget's room, even ones with no spending", () => {
    const out = whatIf(base, [
      { groupId: "eating", cents: 10_000 },
      { groupId: "shopping", cents: 25_000 },
      { groupId: "repairs", cents: 60_000 },
    ]);
    expect(out.safeCents).toBe(-5_000);
    expect([room(out, "eating"), room(out, "shopping"), room(out, "fun")]).toEqual([0, 0, 0]);
    expect(out.groups.find((g) => g.id === "repairs")!.limitCents).toBeNull();
  });

  it("an essential overspend lowers safe to spend by the overage", () => {
    const out = whatIf(base, [{ groupId: "fuel", cents: 54_000 }]);
    // Fuel spent $600 of $500: still to come drops by $440, pool left by $540.
    expect(out.safeCents).toBe(90_000 - 10_000);
    expect(out.groups.find((g) => g.id === "fuel")!.overCents).toBe(10_000);
  });

  it("automatic flexible guardrails shrink together to fit the pool, and the gap is reported", () => {
    const out = monthPlan({
      incomeCents: 300_000,
      billsCents: 100_000,
      debtCents: 0,
      groups: [
        { id: "g", tier: "ESSENTIAL", manualCents: null, usualCents: 150_000, spentCents: 0 },
        { id: "a", tier: "FLEXIBLE", manualCents: null, usualCents: 60_000, spentCents: 0 },
        { id: "b", tier: "FLEXIBLE", manualCents: null, usualCents: 40_000, spentCents: 0 },
      ],
    });
    expect(out.flexibleLimitCents).toBe(50_000);
    expect(out.groups.find((g) => g.id === "a")!.limitCents).toBe(30_000);
    expect(out.groups.find((g) => g.id === "b")!.limitCents).toBe(20_000);
    expect(out.gapCents).toBe(50_000);
    expect(out.shortCents).toBe(0);
  });

  it("a closed month has nothing still to come", () => {
    expect(monthPlan({ ...base, closed: true }).safeCents).toBe(304_000);
  });
});

describe("unplanned reserve", () => {
  const groups = [
    { id: "food", tier: "ESSENTIAL" as const, manualCents: null, usualCents: 200_000, spentCents: 0 },
    { id: "fun", tier: "FLEXIBLE" as const, manualCents: null, usualCents: 300_000, spentCents: 0 },
    { id: "repair", tier: "UNPLANNED" as const, manualCents: null, usualCents: 50_000, spentCents: 0 },
  ];
  it("is set aside before the extras' limits", () => {
    const out = monthPlan({ incomeCents: 400_000, billsCents: 0, debtCents: 0, reserveCents: 50_000, groups });
    expect(out.groups.find((g) => g.id === "fun")!.limitCents).toBe(150_000);
    expect(out.safeCents).toBe(400_000 - 200_000 - 50_000);
  });
  it("past the reserve, unplanned spending lowers the extras' room", () => {
    const spent = groups.map((g) => (g.id === "repair" ? { ...g, spentCents: 80_000 } : g));
    const out = monthPlan({ incomeCents: 400_000, billsCents: 0, debtCents: 0, reserveCents: 50_000, groups: spent });
    expect(out.unplannedOverCents).toBe(30_000);
    expect(out.reserveLeftCents).toBe(0);
    expect(out.groups.find((g) => g.id === "fun")!.roomCents).toBe(120_000);
  });
});
