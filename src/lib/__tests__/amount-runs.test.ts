import { describe, expect, it } from "vitest";
import { amountRuns, suggestAmount } from "../amount-runs";

const pay = (list: Array<[string, number]>) => list.map(([ym, d]) => ({ ym, cents: Math.round(d * 100) }));

describe("amount runs", () => {
  it("splits a mortgage into stretches by escrow year and extra principal", () => {
    const p = pay([
      ["2023-01", 2850], ["2023-02", 2850], ["2023-03", 2850], ["2023-04", 2850],
      ["2024-01", 2310], ["2024-02", 2310.5], ["2024-03", 2311],
      ["2025-01", 2412], ["2025-02", 2412], ["2025-03", 2412], ["2025-04", 2412],
    ]);
    const runs = amountRuns(p);
    expect(runs.map((r) => [r.from, r.to, r.cents])).toEqual([
      ["2023-01", "2023-04", 285000],
      ["2024-01", "2024-03", 231050],
      ["2025-01", "2025-04", 241200],
    ]);
  });
  it("ignores a one-off payment between stretches", () => {
    const runs = amountRuns(pay([["2025-01", 100], ["2025-02", 100], ["2025-03", 100], ["2025-04", 300], ["2025-05", 120], ["2025-06", 120], ["2025-07", 120]]));
    expect(runs.map((r) => r.cents)).toEqual([10000, 12000]);
  });
});

describe("suggest amount", () => {
  it("suggests the current stretch when it differs from the usual amount", () => {
    const p = pay([["2026-07", 2412], ["2026-08", 2412], ["2026-09", 2412], ["2026-10", 2412]]);
    expect(suggestAmount(p, 235000, "2026-11")).toEqual({ kind: "steady", cents: 241200, since: "2026-07", count: 4 });
    expect(suggestAmount(p, 241000, "2026-11")).toBeNull();
  });
  it("flags a bill whose last three payments keep landing off the budget", () => {
    const p = pay([["2026-01", 60], ["2026-02", 95], ["2026-03", 70], ["2026-04", 110], ["2026-05", 80], ["2026-06", 130], ["2026-07", 90]]);
    expect(suggestAmount(p, 6000, "2026-08")).toEqual({ kind: "drift", cents: 9000, since: "2026-05", count: 3 });
    // One high month among normal ones isn't drift.
    expect(suggestAmount(pay([["2026-05", 300], ["2026-06", 300.5], ["2026-07", 347]]), 30000, "2026-08")).toBeNull();
    // Creeping up: the middle of the last three, rounded up to a dollar.
    expect(suggestAmount(pay([["2026-08", 47.3], ["2026-09", 45], ["2026-10", 53.21], ["2026-11", 53.62]]), 5000, "2026-11")).toEqual({ kind: "drift", cents: 5400, since: "2026-09", count: 3 });
  });
  it("treats a target bill by its typical payment, not one month", () => {
    const p = pay([["2026-06", 92], ["2026-07", 140], ["2026-08", 95], ["2026-09", 101], ["2026-10", 98], ["2026-11", 97]]);
    expect(suggestAmount(p, 10000, "2026-11", true)).toBeNull();
    expect(suggestAmount(p, 8000, "2026-11", true)).toEqual({ kind: "varies", cents: 9800, since: null, count: 6 });
  });
  it("leaves an old stretch alone when it isn't current", () => {
    const p = pay([["2024-01", 50], ["2024-02", 50], ["2024-03", 50]]);
    expect(suggestAmount(p, 4000, "2026-11")).toBeNull();
  });
});
