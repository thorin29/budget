// Every name here is invented.
import { describe, expect, it } from "vitest";
import { clearMatches, matchScore } from "../ledger-match";

const bank = (institution: string | null, name: string, type: "CHECKING" | "SAVINGS" | "CREDIT_CARD") => ({ institution, name, type });

describe("matchScore", () => {
  it("matches on the institution's initials, shared words and last digits", () => {
    expect(matchScore({ name: "EFCU", kind: "BANK" }, bank("Example Federal Credit Union", "Everyday Checking", "CHECKING"))).toBeGreaterThan(0);
    expect(matchScore({ name: "Harbor Rewards", kind: "CREDIT_CARD" }, bank("Harbor Bank", "Rewards Visa", "CREDIT_CARD"))).toBe(4);
    expect(matchScore({ name: "Card 4821", kind: "CREDIT_CARD" }, bank("Some Bank", "Platinum ...4821", "CREDIT_CARD"))).toBe(3);
  });

  it("needs a compatible type and refuses checking for a savings name", () => {
    expect(matchScore({ name: "Harbor", kind: "CREDIT_CARD" }, bank("Harbor Bank", "Checking", "CHECKING"))).toBe(0);
    expect(matchScore({ name: "Harbor Savings", kind: "BANK" }, bank("Harbor Bank", "Checking", "CHECKING"))).toBe(0);
    expect(matchScore({ name: "Cash", kind: "CASH" }, bank("Harbor Bank", "Checking", "CHECKING"))).toBe(0);
  });

  it("ignores generic words", () => {
    expect(matchScore({ name: "Checking", kind: "BANK" }, bank("Harbor Bank", "Checking", "CHECKING"))).toBe(0);
  });
});

describe("clearMatches", () => {
  it("pairs only when each side is the other's single best", () => {
    const accounts = [{ id: "a", name: "Harbor", kind: "BANK" }, { id: "b", name: "Bills", kind: "BANK" }];
    const banks = [{ id: "x", ...bank("Harbor Bank", "Checking", "CHECKING") }, { id: "y", ...bank("Harbor Bank", "Savings", "SAVINGS") }];
    // "Harbor" fits both feed accounts equally: no pair.
    expect(clearMatches(accounts, banks, matchScore)).toEqual([]);
    const one = [{ id: "x", ...bank("Harbor Bank", "Checking", "CHECKING") }];
    expect(clearMatches(accounts, one, matchScore).map(([a, b]) => [a.id, b.id])).toEqual([["a", "x"]]);
  });
});
