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
    expect(rising?.title).toBe("Dining: about $310 a month lately, up from $200");
    expect(rising?.monthlyCents).toBe(11_000);
    // A rising category isn't also offered as a trim.
    expect(out.some((s) => s.kind === "trim" && s.categoryId === "d")).toBe(false);
  });

  it("doesn't count months before the history starts as $0", () => {
    const out = buildSuggestions({
      ...base,
      firstMonth: 1,
      categories: [{ id: "s", name: "Shopping", monthly: [0, 12_900, 12_900, 12_900, 12_900, 12_900] }],
    });
    expect(out.some((s) => s.kind === "rising")).toBe(false);
  });

  it("calls one big month a spike, not a rise, and says what it was", () => {
    const out = buildSuggestions({
      ...base,
      labels: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"],
      categories: [{
        id: "h", name: "Hockey", monthly: [18_000, 20_000, 17_000, 19_000, 380_000, 21_000],
        top: [null, null, null, null, { merchant: "Gear Shop", cents: 320_000 }, null],
      }],
    });
    expect(out.some((s) => s.kind === "rising")).toBe(false);
    const spike = out.find((s) => s.kind === "spike");
    expect(spike?.title).toBe("Hockey: $3,800 in Oct");
    expect(spike?.detail).toBe("One big month; the others ran about $190 a month. The largest charge was Gear Shop for $3,200.00.");
    expect(spike?.months?.map((m) => m.cents)).toEqual([18_000, 20_000, 17_000, 19_000, 380_000, 21_000]);
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

  it("keeps small subscriptions and flags new ones and price increases", () => {
    const out = buildSuggestions({
      ...base,
      merchants: [
        { name: "Cloud Storage", monthly: [0, 0, 0, 299, 299, 299], charges: [0, 0, 0, 1, 1, 1] },
        { name: "New App", monthly: [0, 0, 0, 0, 499, 499], charges: [0, 0, 0, 0, 1, 1] },
        { name: "Streaming B", monthly: [1_599, 1_599, 1_599, 1_599, 1_599, 1_799], charges: [1, 1, 1, 1, 1, 1] },
      ],
    });
    expect(out.find((s) => s.kind === "repeating")?.items?.map((i) => i.name)).toContain("Cloud Storage");
    expect(out.find((s) => s.kind === "new-repeat")?.title).toBe("New monthly charge: New App, $4.99");
    const up = out.find((s) => s.kind === "price-up");
    expect(up?.title).toBe("Streaming B went up to $17.99");
    expect(up?.items?.[0]).toEqual({ name: "Streaming B", cents: 1_799, fromCents: 1_599 });
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
