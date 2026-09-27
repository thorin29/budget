import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { payDatesBetween, utcDate, monthHalves, halfFor, isDueInMonth, buildObligations } from "@/lib/month-model";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("pay date generation", () => {
  it("produces a full year of fortnightly paydays from one anchor", () => {
    const dates = payDatesBetween(
      "BIWEEKLY",
      utcDate(2026, 1, 2),
      [],
      utcDate(2026, 1, 1),
      utcDate(2026, 12, 31),
    ).map(iso);

    assert.equal(dates.length, 26);
    assert.equal(dates[0], "2026-01-02");
    assert.equal(dates.at(-1), "2026-12-18");
    // Every gap is exactly fourteen days.
    for (let i = 1; i < dates.length; i++) {
      const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000;
      assert.equal(gap, 14);
    }
  });

  it("carries fortnightly paydays across a year boundary", () => {
    const dates = payDatesBetween(
      "BIWEEKLY",
      utcDate(2026, 1, 2),
      [],
      utcDate(2026, 12, 1),
      utcDate(2027, 1, 31),
    ).map(iso);
    assert.deepEqual(dates, ["2026-12-04", "2026-12-18", "2027-01-01", "2027-01-15", "2027-01-29"]);
  });

  it("clamps a semi-monthly day to the end of a short month", () => {
    const dates = payDatesBetween(
      "SEMI_MONTHLY",
      null,
      [15, 31],
      utcDate(2026, 2, 1),
      utcDate(2026, 2, 28),
    ).map(iso);
    assert.deepEqual(dates, ["2026-02-15", "2026-02-28"]);
  });

  it("returns nothing for a fortnightly schedule with no anchor", () => {
    const dates = payDatesBetween("BIWEEKLY", null, [], utcDate(2026, 1, 1), utcDate(2026, 3, 1));
    assert.equal(dates.length, 0);
  });
});

describe("month halves", () => {
  it("splits at the configured day", () => {
    const [first, second] = monthHalves(2026, 9, 15);
    assert.equal(iso(first.start), "2026-09-01");
    assert.equal(iso(first.end), "2026-09-15");
    assert.equal(iso(second.start), "2026-09-16");
    assert.equal(iso(second.end), "2026-09-30");
  });

  it("never leaves the second half empty", () => {
    const [, second] = monthHalves(2026, 2, 28);
    assert.ok(second.start <= second.end);
  });

  it("places items by due day, and honours a pin", () => {
    assert.equal(halfFor(3, "AUTO", 15), 0);
    assert.equal(halfFor(20, "AUTO", 15), 1);
    assert.equal(halfFor(20, "FIRST", 15), 0);
    assert.equal(halfFor(3, "SECOND", 15), 1);
    // No due day cannot be placed, so the first half owns it rather than
    // dropping it from the month.
    assert.equal(halfFor(null, "AUTO", 15), 0);
  });
});

const monthly = {
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  scheduleKind: "MONTHLY",
  onlyYear: null,
  startYear: null,
  startMonth: null,
  endYear: null,
  endMonth: null,
  active: true,
};

describe("due months", () => {
  it("respects an explicit month set", () => {
    const quarterly = { ...monthly, months: [1, 4, 7, 10], scheduleKind: "QUARTERLY" };
    assert.equal(isDueInMonth({ ...quarterly, id: "x", name: "x", kind: "BILL", dueDay: 1, periodAssignment: "AUTO" } as never, 2026, 4), true);
    assert.equal(isDueInMonth({ ...quarterly, id: "x", name: "x", kind: "BILL", dueDay: 1, periodAssignment: "AUTO" } as never, 2026, 5), false);
  });

  it("stops at an end month without disturbing earlier ones", () => {
    const ending = { ...monthly, endYear: 2026, endMonth: 8 };
    const item = { ...ending, id: "x", name: "x", kind: "BILL", dueDay: 1, periodAssignment: "AUTO" } as never;
    assert.equal(isDueInMonth(item, 2026, 3), true);
    assert.equal(isDueInMonth(item, 2026, 8), true);
    assert.equal(isDueInMonth(item, 2026, 9), false);
  });

  it("excludes an inactive item entirely", () => {
    const item = { ...monthly, active: false, id: "x", name: "x", kind: "BILL", dueDay: 1, periodAssignment: "AUTO" } as never;
    assert.equal(isDueInMonth(item, 2026, 3), false);
  });
});

describe("carryover", () => {
  const item = {
    ...monthly,
    id: "rent",
    name: "rent",
    kind: "BILL" as const,
    dueDay: 1,
    periodAssignment: "AUTO" as const,
  };

  it("carries an unpaid bill into a later month with its original due date", () => {
    const obligations = buildObligations({
      items: [item],
      planned: new Map([["rent", 120000]]),
      plans: new Map(),
      settled: new Set(["rent:2026:8"]),
      year: 2026,
      month: 9,
      carryMonths: 2,
    });

    const carried = obligations.filter((o) => o.carriedOver);
    assert.equal(carried.length, 1);
    assert.equal(carried[0].month, 7);
    assert.equal(iso(carried[0].dueDate), "2026-07-01");
    assert.equal(carried[0].amountCents, 120000);
  });

  it("drops a month marked as nothing due", () => {
    const obligations = buildObligations({
      items: [item],
      planned: new Map([["rent", 120000]]),
      plans: new Map([["rent:2026:9", { amountCents: null, skipped: true }]]),
      settled: new Set(),
      year: 2026,
      month: 9,
      carryMonths: 0,
    });
    assert.equal(obligations.length, 0);
  });

  it("prefers a month override to the planned amount", () => {
    const obligations = buildObligations({
      items: [item],
      planned: new Map([["rent", 120000]]),
      plans: new Map([["rent:2026:9", { amountCents: 135000, skipped: false }]]),
      settled: new Set(),
      year: 2026,
      month: 9,
      carryMonths: 0,
    });
    assert.equal(obligations[0].amountCents, 135000);
  });
});
