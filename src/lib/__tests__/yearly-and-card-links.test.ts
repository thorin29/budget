// Merchants, cards and amounts here are invented.
import { describe, expect, it } from "vitest";
import { aYearOn, upcomingYearly, type PastCharge } from "../yearly-charges";
import { cardByName, cardsFromHistory, paymentMonth } from "../card-links";

const c = (key: string, postedOn: string, cents: number, merchant = key, description = merchant): PastCharge => ({ key, merchant, description, postedOn, cents });

describe("upcomingYearly", () => {
  const today = "2026-11-16";

  it("finds a charge made around the same date two years running", () => {
    const out = upcomingYearly([c("club", "2024-12-03", 6_000), c("club", "2025-12-01", 6_500)], today);
    expect(out).toEqual([{ key: "club", merchant: "club", expectedOn: "2026-12-01", cents: 6_500, lastOn: "2025-12-01", years: 2 }]);
  });

  it("takes a single charge a year ago only when it reads like a renewal", () => {
    expect(upcomingYearly([c("tv", "2025-12-10", 80_000, "Big TV Store")], today)).toEqual([]);
    expect(upcomingYearly([c("m", "2025-12-10", 13_900, "Warehouse Membership Fee")], today)).toHaveLength(1);
  });

  it("skips merchants charged in between, small charges, and dates outside the window", () => {
    expect(upcomingYearly([c("shop", "2024-12-01", 5_000), c("shop", "2025-06-01", 5_000), c("shop", "2025-12-01", 5_000)], today)).toEqual([]);
    expect(upcomingYearly([c("app", "2024-12-01", 999), c("app", "2025-12-01", 999)], today)).toEqual([]);
    expect(upcomingYearly([c("far", "2024-03-01", 5_000), c("far", "2025-03-01", 5_000)], today)).toEqual([]);
  });

  it("moves Feb 29 to Feb 28", () => {
    expect(aYearOn("2028-02-29")).toBe("2029-02-28");
  });
});

describe("card links", () => {
  it("learns a bill's card from payments recorded by hand", () => {
    const links = cardsFromHistory(
      [
        { lineItemId: "bill", paidOn: "2026-09-05", cents: 38_600 },
        { lineItemId: "bill", paidOn: "2026-10-06", cents: 41_200 },
      ],
      [
        { cardId: "cardA", postedOn: "2026-09-06", cents: 38_600 },
        { cardId: "cardA", postedOn: "2026-10-07", cents: 41_200 },
        { cardId: "cardB", postedOn: "2026-10-20", cents: 41_200 },
      ],
    );
    expect(links.get("bill")).toBe("cardA");
  });

  it("matches a bill to the one card sharing a distinctive word", () => {
    const cards = [
      { id: "a", names: ["Example Store Card", "Example Bank"] },
      { id: "b", names: ["Travel Rewards Visa", "Other Bank"] },
    ];
    expect(cardByName("Example Store", cards)).toBe("a");
    expect(cardByName("Travel card", cards)).toBe("b");
    expect(cardByName("Visa", cards)).toBeNull();
    expect(cardByName("Example Bank Mortgage", cards)).toBeNull();
  });

  it("counts a payment for the statement it pays", () => {
    // Closes on the 11th, due on the 8th.
    expect(paymentMonth("2026-11-09", 8, 11)).toEqual({ year: 2026, month: 11 });
    expect(paymentMonth("2026-11-12", 8, 11)).toEqual({ year: 2026, month: 12 });
    // Without a closing day: the next due date from a few days before.
    expect(paymentMonth("2026-11-12", 8, null)).toEqual({ year: 2026, month: 11 });
    expect(paymentMonth("2026-11-20", 8, null)).toEqual({ year: 2026, month: 12 });
  });
});
