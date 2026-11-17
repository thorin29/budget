// Amounts and names here are invented.
import { describe, expect, it } from "vitest";
import { allowance } from "../allowance";

const every = (cents: number) => Array.from({ length: 12 }, () => cents);

describe("allowance", () => {
  it("is income less fixed bills and payoffs, leaving card payments out", () => {
    const a = allowance({
      rows: [
        { name: "Pay", kind: "INCOME", months: every(400_000), cardPayment: false },
        // A third paycheck twice a year counts for its share.
        { name: "Pay 3", kind: "INCOME", months: [0, 0, 0, 200_000, 0, 0, 0, 0, 0, 200_000, 0, 0], cardPayment: false },
        { name: "Mortgage", kind: "BILL", months: every(180_000), cardPayment: false },
        // Yearly bill: a twelfth a month.
        { name: "Registration", kind: "BILL", months: [0, 0, 12_000, 0, 0, 0, 0, 0, 0, 0, 0, 0], cardPayment: false },
        { name: "Store card", kind: "BILL", months: every(50_000), cardPayment: true },
      ],
      payoffCents: 30_000,
      recentEveryday: [210_000, 230_000, 220_000],
      recentOnCards: [180_000, 200_000, 190_000],
      spentCents: 120_000,
      projectedCents: 225_000,
      day: 16,
      daysInMonth: 30,
    });
    expect(a.incomeCents).toBe(433_333);
    expect(a.incomeSource).toBe("plan");
    expect(a.fixedBillsCents).toBe(181_000);
    expect(a.limitCents).toBe(433_333 - 181_000 - 30_000);
    expect(a.averageCents).toBe(220_000);
    expect(a.overCents).toBe(220_000 - a.limitCents);
    expect(a.averageOnCardsCents).toBe(190_000);
    expect(a.cardPaymentNames).toEqual(["Store card"]);
    expect(a.thisMonth.daysLeft).toBe(15);
    expect(a.thisMonth.leftCents).toBe(a.limitCents - 120_000);
    expect(a.thisMonth.perWeekLeftCents).toBe(Math.round((a.thisMonth.leftCents / 15) * 7));
  });
});
