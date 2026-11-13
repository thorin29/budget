import { describe, expect, it } from "vitest";
import { describeDifference, parseQuickQuery, rankMatches } from "../quick-entry";
import { formatCents } from "../money";

describe("parseQuickQuery", () => {
  it("splits a trailing amount from the name", () => {
    expect(parseQuickQuery("electric 172.40")).toEqual({ words: "electric", amountCents: 17240 });
  });

  it("accepts a dollar sign and thousands separators", () => {
    expect(parseQuickQuery("Car payment $1,204.5")).toEqual({
      words: "car payment",
      amountCents: 120450,
    });
  });

  it("treats a name with no amount as words only", () => {
    expect(parseQuickQuery("  Water ")).toEqual({ words: "water", amountCents: null });
  });

  it("keeps digits that are part of the name", () => {
    expect(parseQuickQuery("loan 2")).toEqual({ words: "loan", amountCents: 200 });
    expect(parseQuickQuery("loan2 50")).toEqual({ words: "loan2", amountCents: 5000 });
  });

  it("reads a bare number as an amount with no item", () => {
    expect(parseQuickQuery("45")).toEqual({ words: "", amountCents: 4500 });
  });

  it("reads a trailing decimal point", () => {
    expect(parseQuickQuery("gas 30.")).toEqual({ words: "gas", amountCents: 3000 });
  });
});

describe("rankMatches", () => {
  const items = [
    { name: "Car insurance" },
    { name: "Electric" },
    { name: "Car payment" },
    { name: "Water & trash" },
    { name: "Home electric backup" },
  ];

  it("returns everything, in order, for an empty query", () => {
    expect(rankMatches(items, "")).toHaveLength(5);
  });

  it("puts a whole-name prefix ahead of a word prefix", () => {
    expect(rankMatches(items, "elec").map((i) => i.name)).toEqual([
      "Electric",
      "Home electric backup",
    ]);
  });

  it("keeps the caller's order on ties", () => {
    expect(rankMatches(items, "car").map((i) => i.name)).toEqual(["Car insurance", "Car payment"]);
  });

  it("matches a word after an ampersand", () => {
    expect(rankMatches(items, "trash").map((i) => i.name)).toEqual(["Water & trash"]);
  });

  it("matches initials as a last resort", () => {
    expect(rankMatches(items, "cp").map((i) => i.name)).toEqual(["Car payment"]);
  });

  it("drops non-matches", () => {
    expect(rankMatches(items, "zzz")).toEqual([]);
  });
});

describe("describeDifference", () => {
  it("names the direction", () => {
    expect(describeDifference(10000, 10000, formatCents)).toBe("exactly on budget");
    expect(describeDifference(9000, 10000, formatCents)).toBe("$10.00 under budget");
    expect(describeDifference(10500, 10000, formatCents)).toBe("$5.00 over budget");
  });
});
