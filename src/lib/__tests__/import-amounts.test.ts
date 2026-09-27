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
      "1010.10", "2648.00", "119.99", "2725.70", "0.00",
      "4516.00", "1763.88", "154.58", "9999999.99", "0.01",
    ];
    for (const value of values) {
      assert.equal(toDecimalString(toCents(value)), value);
    }
  });

  it("sums a column of them exactly", () => {
    const monthly = ["353.00", "335.00", "283.00", "334.00", "354.00", "372.00"];
    const total = monthly.reduce((sum, v) => sum + toCents(v), 0);
    assert.equal(total, 203100);
    assert.equal(toDecimalString(total), "2031.00");
  });

  it("rejects anything that is not a monetary value", () => {
    for (const bad of ["", "abc", "1.2.3", "$100"]) {
      assert.throws(() => toCents(bad), `should reject "${bad}"`);
    }
  });

  it("keeps a repeated fractional amount exact across a year", () => {
    // Twelve months of a value with a fractional cent problem in floating point.
    const year = Array.from({ length: 12 }, () => toCents("1010.10"));
    assert.equal(year.reduce((a, b) => a + b, 0), 1212120);
    assert.equal(toDecimalString(1212120), "12121.20");
  });
});
