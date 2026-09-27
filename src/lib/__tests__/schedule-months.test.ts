import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { monthsForSchedule } from "@/lib/schedule";

describe("schedule months", () => {
  it("covers every month when monthly", () => {
    assert.deepEqual(monthsForSchedule("MONTHLY", 1), [1,2,3,4,5,6,7,8,9,10,11,12]);
    // The anchor is irrelevant for a monthly item.
    assert.deepEqual(monthsForSchedule("MONTHLY", 7), [1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  it("steps quarterly from the anchor and wraps the year", () => {
    assert.deepEqual(monthsForSchedule("QUARTERLY", 1), [1, 4, 7, 10]);
    assert.deepEqual(monthsForSchedule("QUARTERLY", 2), [2, 5, 8, 11]);
    assert.deepEqual(monthsForSchedule("QUARTERLY", 11), [2, 5, 8, 11]);
  });

  it("puts a half-yearly item six months apart", () => {
    assert.deepEqual(monthsForSchedule("SEMI_ANNUAL", 3), [3, 9]);
    assert.deepEqual(monthsForSchedule("SEMI_ANNUAL", 9), [3, 9]);
  });

  it("gives an annual or one-off item a single month", () => {
    assert.deepEqual(monthsForSchedule("ANNUAL", 6), [6]);
    assert.deepEqual(monthsForSchedule("ONE_OFF", 12), [12]);
  });

  it("keeps a custom set, sorted and deduplicated", () => {
    assert.deepEqual(monthsForSchedule("CUSTOM", 1, [8, 2, 8, 5]), [2, 5, 8]);
    assert.deepEqual(monthsForSchedule("CUSTOM", 1, [0, 13, 4]), [4]);
  });

  it("clamps an out-of-range anchor", () => {
    assert.deepEqual(monthsForSchedule("ANNUAL", 0), [1]);
    assert.deepEqual(monthsForSchedule("ANNUAL", 99), [12]);
  });
});
