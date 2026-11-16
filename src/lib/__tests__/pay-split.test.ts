import { describe, expect, it } from "vitest";
import { paydaySplitDay } from "@/server/pay-split";
const d = (...days: number[]) => days.map((x) => new Date(Date.UTC(2026, 0, x)));

describe("paydaySplitDay", () => {
  it("picks the payday nearest the 15th, from the 8th on", () => {
    expect(paydaySplitDay(d(6, 20))).toBe(20);
    expect(paydaySplitDay(d(2, 16, 30))).toBe(16);
    expect(paydaySplitDay(d(13, 27))).toBe(13);
    expect(paydaySplitDay(d(15, 31))).toBe(15);
    expect(paydaySplitDay(d(6, 13, 20, 27))).toBe(13);
    expect(paydaySplitDay(d(1))).toBeNull();
  });
});
