import { describe, expect, it } from "vitest";
import { billLookalike } from "../bill-lookalike";

describe("billLookalike", () => {
  const test = billLookalike([{ merchant: "Acme Auto Loan", cents: 41_002 }, { merchant: "Acme Auto Loan", cents: 41_002 }]);
  const row = (merchant: string, cents: number, extra: Partial<{ categoryId: string | null; linked: boolean }> = {}) => ({ merchant, cents, categoryId: null, linked: false, ...extra });
  it("a payment to a bill's merchant for about the same amount", () => {
    expect(test(row("ACME  auto loan", -40_500))).toBe(true);
  });
  it("not when the amount is far off, it has a category, or it's already linked", () => {
    expect(test(row("Acme Auto Loan", -10_000))).toBe(false);
    expect(test(row("Acme Auto Loan", -41_002, { categoryId: "c1" }))).toBe(false);
    expect(test(row("Acme Auto Loan", -41_002, { linked: true }))).toBe(false);
  });
  it("not from a merchant that never paid a bill", () => {
    expect(test(row("Corner Store", -41_002))).toBe(false);
  });
});
