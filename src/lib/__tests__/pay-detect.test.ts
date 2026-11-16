import { describe, expect, it } from "vitest";
import { calendarMatches, detectPay } from "../pay-detect";

describe("detectPay", () => {
  it("finds every two weeks, including three-paycheck months", () => {
    expect(detectPay(["2026-07-31", "2026-08-14", "2026-08-28", "2026-09-11", "2026-09-25", "2026-10-09"])).toMatchObject({ frequency: "BIWEEKLY", latest: "2026-10-09" });
  });
  it("finds twice a month and monthly", () => {
    expect(detectPay(["2026-07-15", "2026-07-31", "2026-08-14", "2026-08-31", "2026-09-15", "2026-09-30"])).toMatchObject({ frequency: "SEMI_MONTHLY", daysOfMonth: [15, 31] });
    expect(detectPay(["2026-06-01", "2026-07-01", "2026-08-03", "2026-09-01"])).toMatchObject({ frequency: "MONTHLY", daysOfMonth: [1] });
    expect(detectPay(["2026-08-01", "2026-08-15", "2026-09-01", "2026-09-15", "2026-10-01", "2026-10-15"])).toMatchObject({ frequency: "SEMI_MONTHLY", daysOfMonth: [1, 15] });
  });
  it("gives up on too few or scattered dates", () => {
    expect(detectPay(["2026-09-01", "2026-09-15"])).toBeNull();
    expect(detectPay(["2026-06-02", "2026-06-25", "2026-07-03", "2026-08-19"])).toBeNull();
  });
  it("checks a calendar against deposits", () => {
    expect(calendarMatches(["2026-10-09", "2026-10-23"], ["2026-10-09", "2026-10-22"])).toBe(true);
    expect(calendarMatches(["2026-10-02", "2026-10-16"], ["2026-10-09", "2026-10-23"])).toBe(false);
  });
});

import { paydayNumbersFromNames } from "../pay-detect";
describe("paydayNumbersFromNames", () => {
  it("reads Pay, Pay 2, Pay 3 as the 1st, 2nd and 3rd paycheck", () => {
    const m = paydayNumbersFromNames([
      { id: "a", name: "Example Pay" }, { id: "b", name: "Example Pay 2" }, { id: "c", name: "Example Pay 3" },
      { id: "d", name: "Pension" }, { id: "e", name: "Annual Bonus" },
    ]);
    expect([...m]).toEqual([["a", 1], ["b", 2], ["c", 3]]);
  });
  it("leaves lone or odd names alone", () => {
    expect(paydayNumbersFromNames([{ id: "a", name: "Side gig 2" }, { id: "b", name: "Rent" }]).size).toBe(0);
  });
});

import { employerKey } from "../pay-detect";
describe("employer grouping and off-cycle runs", () => {
  it("groups one payroll under two descriptions", () => {
    expect(employerKey("Deposit Example Payco Payroll")).toBe(employerKey("Deposit Example Payco"));
  });
  it("ignores a bonus run when finding the latest payday", () => {
    const d = detectPay(["2026-09-11", "2026-09-25", "2026-10-09", "2026-10-23", "2026-10-28", "2026-11-06"])!;
    expect(d).toMatchObject({ frequency: "BIWEEKLY", latest: "2026-11-06" });
    const withLateBonus = detectPay(["2026-09-11", "2026-09-25", "2026-10-09", "2026-10-23", "2026-11-06", "2026-11-10"])!;
    expect(withLateBonus.latest).toBe("2026-11-06");
  });
  it("tolerates a bonus deposit when checking the calendar", () => {
    expect(calendarMatches(["2026-09-11", "2026-09-25", "2026-10-09", "2026-10-23", "2026-11-06"], ["2026-09-11", "2026-09-25", "2026-10-09", "2026-10-23", "2026-10-28", "2026-11-06", "2026-08-28", "2026-08-14"], "2026-11-06")).toBe(false);
    expect(calendarMatches(["2026-08-14", "2026-08-28", "2026-09-11", "2026-09-25", "2026-10-09", "2026-10-23", "2026-11-06"], ["2026-08-14", "2026-08-28", "2026-09-11", "2026-09-25", "2026-10-09", "2026-10-23", "2026-10-28", "2026-11-06"], "2026-11-06")).toBe(true);
  });
});
