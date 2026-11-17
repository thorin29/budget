// Every amount here is invented.
import { describe, expect, it } from "vitest";
import { cardStatus, dueAfter, dueDatesThrough, lastCloseDate } from "../card-payment";

describe("card dates", () => {
  it("finds the last close and the due date after it", () => {
    expect(lastCloseDate("2026-11-16", 15)).toBe("2026-11-15");
    expect(lastCloseDate("2026-11-10", 15)).toBe("2026-10-15");
    expect(dueAfter("2026-11-15", 10)).toBe("2026-12-10");
    expect(dueAfter("2026-11-08", 30)).toBe("2026-11-30");
    expect(lastCloseDate("2026-03-01", 31)).toBe("2026-02-28");
  });

  it("counts monthly due dates through an end date", () => {
    expect(dueDatesThrough("2026-12-08", "2028-02-11", 8)).toBe(15);
    expect(dueDatesThrough("2026-12-08", "2026-12-07", 8)).toBe(0);
  });
});

describe("cardStatus", () => {
  it("rebuilds the statement and what's left of it", () => {
    const s = cardStatus({
      balanceCents: -60_000,
      closeDay: 12,
      dueDay: 9,
      promoEndsOn: null,
      txns: [
        { postedOn: "2026-11-10", amountCents: -5_000 },
        { postedOn: "2026-11-13", amountCents: -10_000 },
        { postedOn: "2026-11-14", amountCents: 20_000 },
      ],
      today: "2026-11-16",
    });
    // Owed 600 now; after the close: -100 charge, +200 payment → 700 at close.
    expect(s).toMatchObject({ lastClose: "2026-11-12", nextDue: "2026-12-09", statementCents: 70_000, paidSinceCents: 20_000, newChargesCents: 10_000, dueCents: 50_000, suggestedCents: 50_000, plan: "statement" });
  });

  it("spreads a 0% balance over the payments left", () => {
    const s = cardStatus({ balanceCents: -1_500_000, closeDay: 11, dueDay: 8, promoEndsOn: "2028-02-11", txns: [], today: "2026-11-16" });
    expect(s).toMatchObject({ nextDue: "2026-12-08", paymentsLeft: 15, monthlyCents: 100_000, suggestedCents: 100_000, plan: "payoff" });
  });

  it("says paid when nothing is left", () => {
    const s = cardStatus({ balanceCents: 0, closeDay: 8, dueDay: 3, promoEndsOn: null, txns: [], today: "2026-11-16" });
    expect(s.plan).toBe("paid");
  });
});
