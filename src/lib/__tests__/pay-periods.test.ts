import { describe, expect, it } from "vitest";
import { periodBounds, periodIndex } from "../pay-periods";

describe("pay periods", () => {
  it("cuts a two-paycheck month, with the days before the first payday on their own", () => {
    const b = periodBounds([20, 6], 30);
    expect(b).toEqual([
      { startDay: 1, endDay: 5, payday: null },
      { startDay: 6, endDay: 19, payday: 6 },
      { startDay: 20, endDay: 30, payday: 20 },
    ]);
    expect([periodIndex(b, 1), periodIndex(b, 6), periodIndex(b, 19), periodIndex(b, 20), periodIndex(b, null)]).toEqual([0, 1, 1, 2, 0]);
  });
  it("handles weekly pay and a payday on the 1st", () => {
    expect(periodBounds([1, 8, 15, 22, 29], 31).map((p) => [p.startDay, p.endDay])).toEqual([[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]]);
  });
  it("is the whole month without paydays", () => {
    expect(periodBounds([], 28)).toEqual([{ startDay: 1, endDay: 28, payday: null }]);
  });
});
