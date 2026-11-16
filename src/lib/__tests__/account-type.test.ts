// Account names here are generic examples of how institutions word them.
import { describe, expect, it } from "vitest";
import { displayAccountName, guessAccountType, guessWithSiblings, isDormant } from "../account-type";

describe("guessAccountType", () => {
  const cases: Array<[string, number | null, string]> = [
    ["Everyday Checking - 1234 (1234)", 50_000, "CHECKING"],
    ["Spending Checking", 0, "CHECKING"],
    ["Money Market Savings", 100, "SAVINGS"],
    ["Share Savings", 100, "SAVINGS"],
    ["Rewards Visa Signature (0001)", -1_000, "CREDIT_CARD"],
    ["Store Credit Card (0002)", 0, "CREDIT_CARD"],
    ["Platinum (0003)", -500, "CREDIT_CARD"],
    ["Travel Card Plus (0004)", -500, "CREDIT_CARD"],
    ["Productname (0009)", -4_500, "CREDIT_CARD"],
    ["New Vehicle Loan - 0005", -2_000_000, "LOAN"],
    ["Mortgage 0006", -30_000_000, "MORTGAGE"],
    ["Example Corp 401(k) Plan (1-01)", 8_000_000, "RETIREMENT"],
    ["Investment Mix for Thrift Savings Plan", 2_000_000, "RETIREMENT"],
    ["Roth IRA", 100, "RETIREMENT"],
    ["Joint Tenant Brokerage ...123", 3_000_000, "INVESTMENT"],
    ["BTC Wallet (abc)", 800, "CRYPTO"],
    ["Staked ETH", 100, "CRYPTO"],
    ["Kid Name (0007)", 0, "OTHER"],
    ["Mystery (0008)", -100, "CREDIT_CARD"],
  ];
  for (const [name, balance, type] of cases) {
    it(`${name} → ${type}`, () => expect(guessAccountType(name, balance)).toBe(type));
  }

  it("doesn't mistake a name containing eth for crypto", () => {
    expect(guessAccountType("Bethany Savings", 0)).toBe("SAVINGS");
  });

  it("borrows the type of most siblings at the same institution", () => {
    const rows = [
      { institution: "Exchange", name: "BTC Wallet", balanceCents: 1 },
      { institution: "Exchange", name: "SOL Wallet", balanceCents: 0 },
      { institution: "Exchange", name: "Cash (USD)", balanceCents: 0 },
      { institution: "Bank", name: "Cash (USD)", balanceCents: 0 },
    ];
    expect(guessWithSiblings(rows)).toEqual(["CRYPTO", "CRYPTO", "CRYPTO", "OTHER"]);
  });
});

describe("display names and dormancy", () => {
  it("drops repeated digits and internal ids", () => {
    expect(displayAccountName("Everyday Checking - 1234 (1234)")).toBe("Everyday Checking - 1234");
    expect(displayAccountName("BTC Wallet (90714717-cb51-516e-9587-f2d52d0c0462)")).toBe("BTC Wallet");
    expect(displayAccountName("Rewards Card (0001)")).toBe("Rewards Card (0001)");
  });

  it("folds only empty and quiet accounts", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(isDormant(0, null, now)).toBe(true);
    expect(isDormant(0, new Date("2026-11-01"), now)).toBe(false);
    expect(isDormant(812, null, now)).toBe(false);
    expect(isDormant(0, new Date("2026-08-01"), now)).toBe(true);
  });
});
