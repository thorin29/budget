import { describe, expect, it } from "vitest";
import { cushion, forecastGroups, forecastTotals } from "../budget-forecast";

const g = (name: string, tier: "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED" | "SORT", spent: number, limit: number | null, usual = 0, charges = 5) => ({ id: name, name, tier, spentCents: spent, limitCents: limit, usualCents: usual, charges });

describe("budget forecast", () => {
  it("carries the daily rate to month end, counts a monthly charge once, doesn't forecast unplanned", () => {
    const rows = forecastGroups([g("Groceries", "ESSENTIAL", 120_000, 210_000), g("Fitness", "FLEXIBLE", 14_938, 15_000, 14_938, 1), g("Medical", "UNPLANNED", 48_180, null)], 19, 30, false);
    expect(rows[0].forecastCents).toBe(189_474);
    expect(rows[0].marginCents).toBe(20_526);
    expect(rows[1].monthly).toBe(true);
    expect(rows[1].forecastCents).toBe(14_938);
    expect(rows[2].forecastCents).toBe(48_180);
    expect(rows[2].marginCents).toBeNull();
    const t = forecastTotals(rows);
    expect(t.budgetCents).toBe(225_000);
    expect(t.forecastCents).toBe(189_474 + 14_938 + 48_180);
    expect(t.marginCents).toBe(225_000 - t.forecastCents);
  });

  it("forecasts what was spent once the month is over", () => {
    expect(forecastGroups([g("Groceries", "ESSENTIAL", 120_000, 210_000)], 30, 30, true)[0].forecastCents).toBe(120_000);
  });

  it("works the cushion forward and back", () => {
    const c = cushion(512_100, 158_000, -84_400, 5_000);
    expect(c.endCents).toBe(354_100);
    expect(c.startCents).toBe(438_500);
    expect(c.nextCents).toBe(269_700);
    expect(c.monthsLeft).toBe(4);
    expect(cushion(100_000, 0, 10_000, 0).monthsLeft).toBeNull();
  });
});
