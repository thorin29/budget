import { describe, expect, it } from "vitest";
import { YEAR_CSV_TEMPLATE, yearCsvToDocument } from "../year-csv-import";

describe("year CSV import", () => {
  it("reads the template", () => {
    const d = yearCsvToDocument(YEAR_CSV_TEMPLATE, 2027);
    expect(d.lineItems.map((l) => [l.name, l.suggestedKind, l.plannedAmount, l.months.length])).toEqual([
      ["Electric", "BILL", "150.00", 12],
      ["Paycheck", "INCOME", "3000.00", 12],
    ]);
    expect(d.categories).toEqual([{ name: "Utilities" }, { name: "Paycheck" }]);
  });
  it("keeps the usual amount, other months as their own, and paid amounts", () => {
    const csv = "Item,Kind,Category,Jan budget,Jan paid,Feb budget,Feb paid,Mar budget,Mar paid,Total budget,Total paid\r\nWater,Bill,Utilities,95.00,90.10,95.00,,120.00,118.00,310.00,208.10\r\n";
    const [w] = yearCsvToDocument(csv, 2025).lineItems;
    expect(w.plannedAmount).toBe("95.00");
    expect(w.months).toEqual([1, 2, 3]);
    expect(w.monthlyOverrides).toEqual([{ month: 3, amount: "120.00" }]);
    expect(w.actuals).toEqual([{ month: 1, amount: "90.10" }, { month: 3, amount: "118.00" }]);
  });
  it("explains a file that isn't a year plan", () => {
    expect(() => yearCsvToDocument("Date,Amount\r\n2025-01-01,5\r\n", 2025)).toThrow(/Item/);
  });
});
