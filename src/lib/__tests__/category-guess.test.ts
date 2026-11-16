// Merchant names here are national chains or invented.
import { describe, expect, it } from "vitest";
import { guessCategory, guessFor, isIncomeCategory, isPeerPayment } from "../category-guess";

const name = (m: string, d = m, cents = -1_000) => guessCategory(m, d, cents)?.name ?? null;

describe("guessCategory", () => {
  it("recognizes common merchants and plain words", () => {
    expect(name("Kroger", "KROGER #123")).toBe("Groceries");
    expect(name("Starbucks")).toBe("Dining");
    expect(name("Uber Eats", "UBER EATS PENDING")).toBe("Dining");
    expect(name("Uber", "UBER TRIP")).toBe("Travel");
    expect(name("Shell Oil", "SHELL OIL 5744")).toBe("Fuel");
    expect(name("Netflix.com")).toBe("Subscriptions");
    expect(name("Amazon", "AMZN Mktp US")).toBe("Shopping");
    expect(name("Example City Water Utility")).toBe("Utilities");
    expect(name("Grace Community Church")).toBe("Giving");
    expect(name("Lowe's", "LOWE'S #0001")).toBe("Home");
  });

  it("guesses nothing for unknown merchants or payment apps", () => {
    expect(name("Brightwater Studio")).toBeNull();
    expect(name("Venmo", "VENMO PAYMENT")).toBeNull();
    expect(isPeerPayment("Zelle to someone")).toBe(true);
    expect(isPeerPayment("Kroger")).toBe(false);
  });

  it("only guesses pay for money in, and uses the merchant for card refunds", () => {
    expect(name("Example Corp", "EXAMPLE CORP PAYROLL", 250_000)).toBe("Paycheck");
    expect(name("Kroger", "KROGER", 1_000)).toBeNull();
    expect(guessFor("Kroger", "KROGER", 1_000, true)?.name).toBe("Groceries");
    expect(name("Example Corp", "PAYROLL", -1_000)).toBeNull();
  });

  it("knows which names are income", () => {
    expect(isIncomeCategory("Paycheck")).toBe(true);
    expect(isIncomeCategory(" income ")).toBe(true);
    expect(isIncomeCategory("Groceries")).toBe(false);
    expect(isIncomeCategory(null)).toBe(false);
  });
});
