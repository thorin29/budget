import { describe, expect, it } from "vitest";
import { assignLimits, carried, payoffDate, perPeriod, share, standing, whatIf, type EnvelopeIn, type LimitGroup } from "../envelopes";

const g = (id: string, tier: LimitGroup["tier"], averageCents: number, manualCents: number | null = null): LimitGroup => ({ id, tier, averageCents, manualCents });

describe("assignLimits", () => {
  const groups = [g("food", "ESSENTIAL", 90_000), g("giving", "PLANNED", 50_000), g("out", "FLEXIBLE", 40_000), g("shop", "FLEXIBLE", 100_000), g("fun", "FLEXIBLE", 60_000)];

  it("keeps essentials and planned whole and scales flexible to what's left", () => {
    const r = assignLimits({ incomeCents: 500_000, billsCents: 230_000, debtCents: 30_000, groups });
    expect(r.limits.get("food")).toBe(90_000);
    expect(r.flexibleCents).toBe(100_000);
    expect([r.limits.get("out"), r.limits.get("shop"), r.limits.get("fun")]).toEqual([20_000, 50_000, 30_000]);
    expect(r.unassignedCents).toBe(0);
  });

  it("never gives more than usual; the rest is extra", () => {
    const r = assignLimits({ incomeCents: 800_000, billsCents: 230_000, debtCents: 30_000, groups });
    expect(r.limits.get("shop")).toBe(100_000);
    expect(r.unassignedCents).toBe(200_000);
  });

  it("moves the automatic limits when one is set by hand", () => {
    const set = groups.map((x) => (x.id === "out" ? { ...x, manualCents: 40_000 } : x));
    const r = assignLimits({ incomeCents: 500_000, billsCents: 230_000, debtCents: 30_000, groups: set });
    expect(r.limits.get("out")).toBe(40_000);
    expect([r.limits.get("shop"), r.limits.get("fun")]).toEqual([37_500, 22_500]);
    expect(r.shortCents).toBe(0);
  });

  it("reports when hand-set limits exceed the pot, or the pot is gone", () => {
    const set = groups.map((x) => (x.id === "out" ? { ...x, manualCents: 150_000 } : x));
    const r = assignLimits({ incomeCents: 500_000, billsCents: 230_000, debtCents: 30_000, groups: set });
    expect(r.shortCents).toBe(50_000);
    expect(r.limits.get("shop")).toBe(0);
    const none = assignLimits({ incomeCents: 300_000, billsCents: 230_000, debtCents: 30_000, groups });
    expect(none.flexibleCents).toBe(0);
    expect(none.limits.get("fun")).toBe(0);
  });
});

describe("share", () => {
  const env = (id: string, tier: EnvelopeIn["tier"], limitCents: number, spentCents: number, carriedCents?: number): EnvelopeIn => ({ id, name: id, tier, limitCents, spentCents, carriedCents });
  const base = [env("food", "ESSENTIAL", 90_000, 62_000), env("out", "FLEXIBLE", 20_000, 26_000), env("clothes", "FLEXIBLE", 15_000, 0), env("shop", "FLEXIBLE", 50_000, 39_400), env("fun", "FLEXIBLE", 55_000, 33_600)];

  it("takes an overage from the flexible envelopes with room, by their room", () => {
    const r = share(base);
    const by = new Map(r.envelopes.map((e) => [e.id, e]));
    expect(by.get("out")).toMatchObject({ overCents: 6_000, leftCents: 0 });
    expect(r.envelopes.reduce((s, e) => s + e.gaveCents, 0)).toBe(6_000);
    expect(by.get("food")!.gaveCents).toBe(0);
    expect(r.flexibleLeftCents).toBe(15_000 + 10_600 + 21_400 - 6_000);
    expect(r.envelopes.every((e) => e.leftCents >= 0)).toBe(true);
    expect(by.get("clothes")!.gaveCents).toBeGreaterThan(by.get("shop")!.gaveCents);
  });

  it("lets essentials draw on flexible money, and reports an empty pot", () => {
    const r = share([env("food", "ESSENTIAL", 90_000, 100_000), env("fun", "FLEXIBLE", 8_000, 2_000)]);
    expect(r.coveredCents).toBe(6_000);
    expect(r.shortCents).toBe(4_000);
    expect(r.flexibleLeftCents).toBe(-4_000);
    expect(standing(r, 8_000)).toBe("short");
  });

  it("keeps a save-up's balance out of the sharing", () => {
    const r = share([env("season", "PLANNED", 25_000, 0, 75_000), env("out", "FLEXIBLE", 20_000, 30_000), env("fun", "FLEXIBLE", 30_000, 0)]);
    const by = new Map(r.envelopes.map((e) => [e.id, e]));
    expect(by.get("season")).toMatchObject({ leftCents: 100_000, gaveCents: 0 });
    expect(by.get("fun")!.gaveCents).toBe(10_000);
  });

  it("shows what a purchase would do", () => {
    const r = whatIf(base, "clothes", 25_000);
    const by = new Map(r.envelopes.map((e) => [e.id, e]));
    expect(by.get("clothes")!.overCents).toBe(10_000);
    expect(r.flexibleLeftCents).toBe(share(base).flexibleLeftCents - 25_000);
  });

  it("names the standing", () => {
    expect(standing(share(base), 140_000)).toBe("ok");
    expect(standing(share([env("fun", "FLEXIBLE", 50_000, 45_000)]), 50_000)).toBe("low");
    expect(standing(share([env("fun", "FLEXIBLE", 50_000, 50_000)]), 50_000)).toBe("empty");
  });
});

describe("pay periods", () => {
  it("turns a monthly amount into a pay period's share", () => {
    expect(perPeriod(260_000, 26)).toBe(120_000);
    expect(perPeriod(100_000, 12)).toBe(100_000);
  });
  it("carries what essentials didn't use, up to a cap, and never an overage", () => {
    expect(carried(10_000, [4_000, 2_000], 20_000)).toBe(14_000);
    expect(carried(10_000, [0, 0, 0, 0], 20_000)).toBe(20_000);
    expect(carried(10_000, [25_000, 6_000], 20_000)).toBe(4_000);
    expect(carried(10_000, [], 20_000)).toBe(0);
  });
  it("lets a save-up build and run behind", () => {
    expect(carried(25_000, [0, 0, 0], null)).toBe(75_000);
    expect(carried(25_000, [90_000], null)).toBe(-65_000);
  });
  it("projects a payoff date", () => {
    expect(payoffDate(100_000, 25_000, 14, "2026-01-02")).toBe("2026-02-27");
    expect(payoffDate(100_000, 0, 14, "2026-01-02")).toBeNull();
    expect(payoffDate(0, 0, 14, "2026-01-02")).toBe("2026-01-02");
  });
});

import { defaultGroupFor } from "../envelope-defaults";

describe("default groups", () => {
  it("places common category names", () => {
    expect(defaultGroupFor("Groceries")).toBe("Food at home");
    expect(defaultGroupFor("Target & Walmart")).toBe("Food at home");
    expect(defaultGroupFor("Fast food")).toBe("Eating out");
    expect(defaultGroupFor("Coffee & treats")).toBe("Eating out");
    expect(defaultGroupFor("Fuel")).toBe("Getting around");
    expect(defaultGroupFor("Medical")).toBe("Health");
    expect(defaultGroupFor("Lessons & activities")).toBe("School & kids");
    expect(defaultGroupFor("Church activities")).toBe("Giving");
    expect(defaultGroupFor("Gifts & occasions")).toBe("Occasions & trips");
    expect(defaultGroupFor("Outdoors & sports")).toBe("Fun");
    expect(defaultGroupFor("Home")).toBe("Shopping");
    expect(defaultGroupFor("Housing")).toBe("Home & bills");
    expect(defaultGroupFor("Sports fees")).toBe("Sports seasons");
    expect(defaultGroupFor("Fees")).toBe("Home & bills");
    expect(defaultGroupFor("Brightwater")).toBeNull();
  });
});
