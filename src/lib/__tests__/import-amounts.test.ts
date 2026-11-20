import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { toCents, toDecimalString } from "@/lib/money";

/**
 * Amounts in an import document are fixed decimal strings. They must survive the
 * trip into cents and back without drift — a spreadsheet's worth of values is
 * exactly where floating point would quietly lose a penny.
 */
describe("import amounts", () => {
  it("round-trips the values a workbook actually contains", () => {
    const values = [
      "1050.00", "2450.00", "99.99", "2550.00", "0.00",
      "4300.00", "1550.00", "160.00", "9999999.99", "0.01",
    ];
    for (const value of values) {
      assert.equal(toDecimalString(toCents(value)), value);
    }
  });

  it("sums a column of them exactly", () => {
    const monthly = ["310.00", "320.00", "290.00", "330.00", "340.00", "350.00"];
    const total = monthly.reduce((sum, v) => sum + toCents(v), 0);
    assert.equal(total, 194000);
    assert.equal(toDecimalString(total), "1940.00");
  });

  it("rejects anything that is not a monetary value", () => {
    for (const bad of ["", "abc", "1.2.3", "$100"]) {
      assert.throws(() => toCents(bad), `should reject "${bad}"`);
    }
  });

  it("keeps a repeated fractional amount exact across a year", () => {
    // Twelve months of a value with a fractional cent problem in floating point.
    const year = Array.from({ length: 12 }, () => toCents("1017.30"));
    assert.equal(year.reduce((a, b) => a + b, 0), 1220760);
    assert.equal(toDecimalString(1220760), "12207.60");
  });
});
