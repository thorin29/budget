import { describe, expect, it } from "vitest";
import { payoffSchedule, paymentsFor } from "../payoff";

describe("payoffSchedule", () => {
  it("ends on the same month count as the payoff", () => {
    const s = payoffSchedule(240_000_00, 1_850_00, 625, "2026-11-19");
    const n = paymentsFor(240_000_00, 1_850_00, 625).paymentsLeft!;
    expect(s.length - 1).toBe(n);
    expect(s[1].date).toBe("2026-11-30");
    expect(s.at(-1)!.cents).toBe(0);
  });
  it("stops when the payment doesn't cover the interest", () => {
    expect(payoffSchedule(100_000_00, 100_00, 2000, "2026-11-19").length).toBe(1);
  });
  it("counts a 0% balance down evenly", () => {
    expect(payoffSchedule(600_00, 200_00, 0, "2026-11-19").map((p) => p.cents)).toEqual([60000, 40000, 20000, 0]);
  });
});
