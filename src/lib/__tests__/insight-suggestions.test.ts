import { describe, expect, it } from "vitest";
import { buildSuggestions, isFeeCharge, isInterestCharge, isSteadyEveryday } from "../insight-suggestions";
import { cardColor, customColor, isCustomColor } from "../card-colors";

const base = { categories: [], merchants: [], interest: [0, 0, 0, 0, 0, 0], fees: [0, 0, 0, 0, 0, 0], promos: [] };

describe("buildSuggestions", () => {
  it("flags a category whose last three months run well above the three before", () => {
    const out = buildSuggestions({
      ...base,
      categories: [{ id: "d", name: "Dining", monthly: [20_000, 21_000, 19_000, 30_000, 32_000, 31_000] }],
    });
    const rising = out.find((s) => s.kind === "rising");
    expect(rising?.title).toBe("Dining is up $110 a month");
    expect(rising?.monthlyCents).toBe(11_000);
    // A rising category isn't also offered as a trim.
    expect(out.some((s) => s.kind === "trim" && s.categoryId === "d")).toBe(false);
  });

  it("offers a trim on large flexible categories only", () => {
    const out = buildSuggestions({
      ...base,
      categories: [
        { id: "s", name: "Shopping", monthly: [40_000, 40_000, 40_000, 40_000, 40_000, 40_000] },
        { id: "g", name: "Groceries", monthly: [90_000, 90_000, 90_000, 90_000, 90_000, 90_000] },
      ],
    });
    const trims = out.filter((s) => s.kind === "trim");
    expect(trims.map((t) => t.categoryId)).toEqual(["s"]);
    expect(trims[0].monthlyCents).toBe(6_000);
  });

  it("finds steady monthly charges and ignores irregular ones", () => {
    const out = buildSuggestions({
      ...base,
      merchants: [
        { name: "Streaming A", monthly: [0, 0, 0, 1_599, 1_599, 1_599], charges: [0, 0, 0, 1, 1, 1] },
        { name: "Gym", monthly: [0, 0, 0, 4_000, 4_200, 4_000], charges: [0, 0, 0, 1, 1, 1] },
        { name: "Hardware store", monthly: [0, 0, 0, 2_000, 9_000, 500], charges: [0, 0, 0, 1, 2, 1] },
        { name: "Corner store", monthly: [0, 0, 0, 3_000, 3_000, 3_000], charges: [0, 0, 0, 5, 4, 6] },
      ],
    });
    const rep = out.find((s) => s.kind === "repeating");
    expect(rep?.items?.map((i) => i.name)).toEqual(["Gym", "Streaming A"]);
  });

  it("totals card interest and fees, and lists payoff plans", () => {
    const out = buildSuggestions({
      ...base,
      interest: [5_000, 5_000, 5_000, 6_000, 6_000, 6_000],
      fees: [0, 0, 3_900, 0, 0, 0],
      promos: [{ name: "Card B", monthlyCents: 150_000, paymentsLeft: 15, endsOn: "2028-02-11" }],
    });
    expect(out.find((s) => s.kind === "interest")?.title).toBe("Card interest cost $330 over 6 months");
    expect(out.find((s) => s.kind === "fees")?.monthlyCents).toBe(650);
    expect(out.find((s) => s.kind === "payoff")?.detail).toContain("Feb 11, 2028");
    // Ranked by what acting on it keeps each month.
    expect(out[0].kind).toBe("interest");
  });

  it("says nothing with under three months of history", () => {
    expect(buildSuggestions({ ...base, interest: [1, 2], categories: [] })).toEqual([]);
  });

  it("recognizes interest and fee descriptions", () => {
    expect(isInterestCharge("INTEREST CHARGE ON PURCHASES")).toBe(true);
    expect(isInterestCharge("Interest paid")).toBe(false);
    expect(isFeeCharge("LATE FEE")).toBe(true);
    expect(isFeeCharge("Coffee")).toBe(false);
    expect(isSteadyEveryday("Groceries")).toBe(true);
    expect(isSteadyEveryday("Subscriptions")).toBe(false);
  });
});

describe("card colors", () => {
  it("draws an exactly picked color, with ink that reads on it", () => {
    expect(isCustomColor("#0F3F2B")).toBe(true);
    expect(isCustomColor("forest")).toBe(false);
    const dark = cardColor("#0f3f2b");
    expect(dark.ink).toBe("light");
    expect(dark.background).toContain("#0f3f2b");
    expect(customColor("#e8e8e8").ink).toBe("dark");
    expect(cardColor("nope").id).toBe("graphite");
  });
});
