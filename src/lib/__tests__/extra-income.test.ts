import { describe, expect, it } from "vitest";
import { isExtraIncome } from "../extra-income";

const pay = (paydayNumber: number | null, extra: Partial<{ scheduleKind: string; months: number[]; plannedCents: number }> = {}) => ({
  paydayNumber,
  scheduleKind: "MONTHLY",
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  plannedCents: 150_000,
  ...extra,
});

describe("isExtraIncome", () => {
  it("every two weeks: the 3rd check is extra", () => {
    expect(isExtraIncome(pay(2), "BIWEEKLY")).toBe(false);
    expect(isExtraIncome(pay(3), "BIWEEKLY")).toBe(true);
  });
  it("weekly: the 3rd and 4th are normal, the 5th is extra", () => {
    expect(isExtraIncome(pay(3), "WEEKLY")).toBe(false);
    expect(isExtraIncome(pay(4), "WEEKLY")).toBe(false);
    expect(isExtraIncome(pay(5), "WEEKLY")).toBe(true);
  });
  it("twice a month and monthly pay are never extra by number", () => {
    expect(isExtraIncome(pay(2), "SEMI_MONTHLY")).toBe(false);
    expect(isExtraIncome(pay(1), "MONTHLY")).toBe(false);
  });
  it("bonuses: not every month, or planned at $0", () => {
    expect(isExtraIncome(pay(null, { scheduleKind: "QUARTERLY", months: [3, 6, 9, 12] }), null)).toBe(true);
    expect(isExtraIncome(pay(null, { plannedCents: 0 }), null)).toBe(true);
    expect(isExtraIncome(pay(null), null)).toBe(false);
  });
});
