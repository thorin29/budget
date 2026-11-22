import { describe, expect, it } from "vitest";
import { matchCardFile, parseCardFile } from "../card-file";

const CSV = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-03-02,2026-03-03,1111,COFFEE SHOP,Dining,4.50,
2026-03-02,2026-03-03,2222,COFFEE SHOP,Dining,4.50,
2026-03-05,2026-03-06,2222,BOOKSTORE,Merchandise,23.10,
2026-03-07,2026-03-08,2222,BOOKSTORE,Merchandise,,23.10
2026-03-09,2026-03-10,1111,PAYMENT,Payment/Credit,,100.00
`;

describe("parseCardFile", () => {
  it("reads card, dates and signed amounts", () => {
    const rows = parseCardFile(CSV);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ transactionDate: "2026-03-02", postedDate: "2026-03-03", last4: "1111", cents: -450 });
    expect(rows[3].cents).toBe(2310);
  });
  it("reads US dates and a single amount column", () => {
    const rows = parseCardFile(`Date,Card Number,Amount\n03/02/2026,XXXX-3333,-12.00\n`);
    expect(rows).toEqual([{ transactionDate: "2026-03-02", postedDate: null, last4: "3333", cents: -1200 }]);
  });
  it("says what's missing", () => {
    expect(() => parseCardFile(`Date,Amount\n2026-03-02,1.00\n`)).toThrow(/card number/);
  });
});

describe("matchCardFile", () => {
  it("pairs each row once, by amount and nearest date", () => {
    const rows = parseCardFile(CSV);
    const feed = [
      { id: "a", postedOn: "2026-03-03", cents: -450 },
      { id: "b", postedOn: "2026-03-04", cents: -450 },
      { id: "c", postedOn: "2026-03-06", cents: -2310 },
      { id: "d", postedOn: "2026-03-08", cents: 2310 },
      { id: "e", postedOn: "2026-04-20", cents: -450 },
    ];
    const m = matchCardFile(rows, feed);
    expect([m.get("a"), m.get("b")].sort()).toEqual(["1111", "2222"]);
    expect(m.get("c")).toBe("2222");
    expect(m.get("d")).toBe("2222");
    expect(m.has("e")).toBe(false);
  });
});
