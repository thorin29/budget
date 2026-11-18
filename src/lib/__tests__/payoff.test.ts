import { describe, expect, it } from "vitest";
import { payoffStatus } from "../payoff";

const every = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("payoffStatus", () => {
  it("counts a balance down by the payments since, and finds the last month", () => {
    const s = payoffStatus({
      accountBalanceCents: null,
      balanceCents: 300_000,
      asOf: "2026-09-01",
      payments: [
        { paidOn: "2026-08-15", cents: 25_000, year: 2026, month: 8 },
        { paidOn: "2026-09-15", cents: 25_000, year: 2026, month: 9 },
        { paidOn: "2026-10-15", cents: 25_000, year: 2026, month: 10 },
        { paidOn: "2026-11-15", cents: 25_000, year: 2026, month: 11 },
      ],
      plannedCents: 25_000,
      months: every,
      today: "2026-11-16",
    })!;
    expect(s).toMatchObject({ source: "balance", remainingCents: 225_000, paymentsLeft: 9, lastYear: 2027, lastMonth: 8, paidOff: false });
  });

  it("follows a linked loan account, and says when it's paid off", () => {
    expect(payoffStatus({ accountBalanceCents: 120_000, balanceCents: null, asOf: null, payments: [], plannedCents: 40_000, months: every, today: "2026-11-16" })).toMatchObject({
      source: "bank", paymentsLeft: 3, lastYear: 2027, lastMonth: 1,
    });
    const done = payoffStatus({ accountBalanceCents: null, balanceCents: 50_000, asOf: "2026-10-01", payments: [{ paidOn: "2026-10-20", cents: 50_000, year: 2026, month: 10 }], plannedCents: 50_000, months: every, today: "2026-11-16" })!;
    expect(done).toMatchObject({ paidOff: true, paymentsLeft: 0, latestPaidYear: 2026, latestPaidMonth: 10 });
  });

  it("says nothing without a balance", () => {
    expect(payoffStatus({ accountBalanceCents: null, balanceCents: null, asOf: null, payments: [], plannedCents: 1, months: every, today: "2026-11-16" })).toBeNull();
  });
});

describe("paymentsFor", () => {
  it("counts payments on an amortized loan and the interest they carry", async () => {
    const { paymentsFor } = await import("../payoff");
    // $10,000 at 6% with $200 a month: 58 payments.
    const r = paymentsFor(1_000_000, 20_000, 600);
    expect(r.paymentsLeft).toBe(58);
    expect(r.interestLeftCents).toBeGreaterThan(150_000);
    expect(r.interestLeftCents).toBeLessThan(160_000);
    expect(paymentsFor(1_000_000, 20_000, null)).toEqual({ paymentsLeft: 50, neverEnds: false, interestLeftCents: null });
    // A payment below the interest never ends.
    expect(paymentsFor(1_000_000, 4_000, 600).neverEnds).toBe(true);
  });
});
