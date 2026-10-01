import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  buildObligations,
  isDueInMonth,
  utcDate,
  type LineItemForMonth,
} from "@/lib/month-model";

/**
 * The remaining figure is what the spreadsheet got wrong: it subtracted actuals
 * from budgets, so paying less than budgeted left a phantom balance owing. Here
 * an entry with an actual is settled and drops out of remaining entirely.
 */

const base: LineItemForMonth = {
  id: "x",
  name: "x",
  kind: "BILL",
  dueDay: 5,
  periodAssignment: "AUTO",
  months: [1,2,3,4,5,6,7,8,9,10,11,12],
  scheduleKind: "MONTHLY",
  onlyYear: null,
  startYear: null,
  startMonth: null,
  endYear: null,
  endMonth: null,
  active: true,
};

const item = (id: string, dueDay: number): LineItemForMonth => ({ ...base, id, name: id, dueDay });

function remaining(obligations: { amountCents: number }[]) {
  return obligations.reduce((sum, o) => sum + o.amountCents, 0);
}

describe("remaining", () => {
  it("drops a settled item entirely, even when paid under budget", () => {
    const items = [item("energy", 5)];
    const planned = new Map([["energy", 40000]]);

    const unpaid = buildObligations({
      items, planned, plans: new Map(), settled: new Set(),
      year: 2026, month: 9, carryMonths: 0,
    });
    assert.equal(remaining(unpaid), 40000);

    // $350 paid against a $400 budget. The spreadsheet would still show $50
    // owing; here the item is settled and contributes nothing.
    const paid = buildObligations({
      items, planned, plans: new Map(), settled: new Set(["energy:2026:9"]),
      year: 2026, month: 9, carryMonths: 0,
    });
    assert.equal(remaining(paid), 0);
  });

  it("uses a month override rather than the plan when computing remaining", () => {
    const obligations = buildObligations({
      items: [item("energy", 5)],
      planned: new Map([["energy", 40000]]),
      plans: new Map([["energy:2026:9", { amountCents: 45000, skipped: false }]]),
      settled: new Set(),
      year: 2026, month: 9, carryMonths: 0,
    });
    assert.equal(remaining(obligations), 45000);
  });

  it("splits into halves at the configured day", () => {
    const obligations = buildObligations({
      items: [item("early", 3), item("late", 22)],
      planned: new Map([["early", 10000], ["late", 20000]]),
      plans: new Map(), settled: new Set(),
      year: 2026, month: 9, splitDay: 15, carryMonths: 0,
    });

    assert.equal(remaining(obligations.filter((o) => o.half === 0)), 10000);
    assert.equal(remaining(obligations.filter((o) => o.half === 1)), 20000);
  });

  it("carries an unpaid bill forward and keeps its original due date", () => {
    const obligations = buildObligations({
      items: [item("rent", 1)],
      planned: new Map([["rent", 120000]]),
      plans: new Map(),
      settled: new Set(["rent:2026:9"]),
      year: 2026, month: 9, carryMonths: 1,
    });

    // September is settled; August is not, so it carries.
    assert.equal(obligations.length, 1);
    assert.equal(obligations[0].carriedOver, true);
    assert.equal(obligations[0].dueDate.getTime(), utcDate(2026, 8, 1).getTime());
    assert.equal(remaining(obligations), 120000);
  });

  it("excludes a month marked as nothing due from remaining", () => {
    const obligations = buildObligations({
      items: [item("card", 20)],
      planned: new Map([["card", 80000]]),
      plans: new Map([["card:2026:9", { amountCents: null, skipped: true }]]),
      settled: new Set(),
      year: 2026, month: 9, carryMonths: 0,
    });
    assert.equal(remaining(obligations), 0);
  });

  it("computes both transfer figures cumulatively", () => {
    const obligations = buildObligations({
      items: [item("a", 3), item("b", 22)],
      planned: new Map([["a", 100000], ["b", 60000]]),
      plans: new Map(), settled: new Set(),
      year: 2026, month: 9, splitDay: 15, carryMonths: 0,
    });

    const balance = 1000000; // $10,000
    const firstRemaining = remaining(obligations.filter((o) => o.half === 0));
    const bothRemaining = remaining(obligations);

    assert.equal(balance - firstRemaining, 900000);
    assert.equal(balance - bothRemaining, 840000);
  });
});

describe("carryover is bounded by months that were actually tracked", () => {
  const monthly: LineItemForMonth = {
    id: "church", name: "church", kind: "BILL", dueDay: 1, periodAssignment: "AUTO",
    months: [1,2,3,4,5,6,7,8,9,10,11,12], scheduleKind: "MONTHLY", onlyYear: null,
    startYear: null, startMonth: null, endYear: null, endMonth: null, active: true,
  };

  /** Mirrors the filter the month service applies. */
  function scoped(obligations: Array<{ year: number; month: number }>, tracked: Set<string>, year: number, month: number) {
    return obligations.filter(
      (o) => (o.year === year && o.month === month) || tracked.has(`${o.year}:${o.month}`),
    );
  }

  it("does not invent unpaid bills for months before any data exists", () => {
    // Actuals recorded for January through August 2026 only.
    const settled = new Set(
      Array.from({ length: 8 }, (_, i) => `church:2026:${i + 1}`),
    );
    const tracked = new Set(Array.from({ length: 8 }, (_, i) => `2026:${i + 1}`));

    const raw = buildObligations({
      items: [monthly],
      planned: new Map([["church", 101010]]),
      plans: new Map(),
      settled,
      year: 2026,
      month: 9,
      carryMonths: 12,
    });

    // Unfiltered, the twelve-month sweep reaches back into 2025, where nothing
    // was ever recorded, and reports a missed payment for every month.
    assert.ok(raw.length > 1);

    const result = scoped(raw, tracked, 2026, 9);
    assert.equal(result.length, 1);
    assert.equal(result[0].year, 2026);
    assert.equal(result[0].month, 9);
  });

  it("still carries a bill left unpaid in a month that was tracked", () => {
    // July was worked in — something else was paid — but this bill was not.
    const settled = new Set(["church:2026:8"]);
    const tracked = new Set(["2026:7", "2026:8"]);

    const raw = buildObligations({
      items: [monthly],
      planned: new Map([["church", 101010]]),
      plans: new Map(),
      settled,
      year: 2026,
      month: 9,
      carryMonths: 12,
    });

    const result = scoped(raw, tracked, 2026, 9);
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((o) => `${o.year}-${o.month}`).sort(),
      ["2026-7", "2026-9"],
    );
  });
});

describe("historical import bounds", () => {
  /** Mirrors the bounds the importer applies when confining to a year. */
  function bounds(year: number, months: number[], actuals: number[], overrides: number[]) {
    const touched = [...months, ...actuals, ...overrides].sort((a, b) => a - b);
    return {
      startYear: year,
      startMonth: touched[0] ?? 1,
      endYear: year,
      endMonth: touched[touched.length - 1] ?? 12,
    };
  }

  const retired: LineItemForMonth = {
    id: "ring", name: "ring", kind: "BILL", dueDay: 9, periodAssignment: "AUTO",
    months: [1,2,3,4,5,6,7,8,9,10,11,12], scheduleKind: "MONTHLY", onlyYear: null,
    startYear: null, startMonth: null, endYear: null, endMonth: null, active: true,
  };

  it("keeps a bill retired years ago out of the current month", () => {
    // Created open-ended from a 2024 workbook, it would read as due forever.
    assert.equal(isDueInMonth(retired, 2026, 9), true);

    const confined = { ...retired, ...bounds(2024, retired.months, [1, 2, 3], []) };
    assert.equal(isDueInMonth(confined, 2024, 6), true);
    assert.equal(isDueInMonth(confined, 2026, 9), false);
    assert.equal(isDueInMonth(confined, 2025, 1), false);
  });

  it("bounds an item to the months it actually covers", () => {
    const seasonal = { ...retired, months: [10] };
    const confined = { ...seasonal, ...bounds(2024, [10], [10], []) };
    assert.equal(confined.startMonth, 10);
    assert.equal(confined.endMonth, 10);
    assert.equal(isDueInMonth(confined, 2024, 10), true);
    assert.equal(isDueInMonth(confined, 2024, 9), false);
  });
});

describe("carry window", () => {
  const monthly: LineItemForMonth = {
    id: "spending", name: "spending", kind: "SETTLEMENT", dueDay: 1,
    periodAssignment: "AUTO", months: [1,2,3,4,5,6,7,8,9,10,11,12],
    scheduleKind: "MONTHLY", onlyYear: null, startYear: null, startMonth: null,
    endYear: null, endMonth: null, active: true,
  };

  // Recorded payments through August 2025, then nothing until September 2026.
  const tracked = new Set([
    "2025:8", "2025:10", "2025:11", "2025:12",
    ...Array.from({ length: 8 }, (_, i) => `2026:${i + 1}`),
  ]);

  function carried(carryMonths: number) {
    return buildObligations({
      items: [monthly],
      planned: new Map([["spending", 450000]]),
      plans: new Map(),
      settled: new Set(Array.from({ length: 8 }, (_, i) => `spending:2026:${i + 1}`)),
      year: 2026,
      month: 9,
      carryMonths,
    }).filter(
      (o) =>
        (o.year === 2026 && o.month === 9) || tracked.has(`${o.year}:${o.month}`),
    );
  }

  it("a twelve-month window drags in bills from the previous year", () => {
    const wide = carried(12);
    assert.ok(wide.some((o) => o.year === 2025));
  });

  it("the default one-month window does not", () => {
    const narrow = carried(1);
    assert.equal(narrow.every((o) => o.year === 2026), true);
    // Only September itself, since August was settled.
    assert.equal(narrow.length, 1);
    assert.equal(narrow[0].month, 9);
  });

  it("zero carries nothing at all", () => {
    const none = carried(0);
    assert.equal(none.length, 1);
    assert.equal(none[0].month, 9);
    assert.equal(none[0].carriedOver, false);
  });
});

describe("items paid from what is left over", () => {
  const base: LineItemForMonth = {
    id: "x", name: "x", kind: "BILL", dueDay: 1, periodAssignment: "AUTO",
    months: [1,2,3,4,5,6,7,8,9,10,11,12], scheduleKind: "MONTHLY", onlyYear: null,
    startYear: null, startMonth: null, endYear: null, endMonth: null, active: true,
  };

  const bills = [
    { ...base, id: "mortgage", name: "mortgage", dueDay: 1 },
    { ...base, id: "energy", name: "energy", dueDay: 20 },
  ];
  const card = { ...base, id: "card", name: "card", kind: "SETTLEMENT" as const, dueDay: 1 };

  const planned = new Map([
    ["mortgage", 264800],
    ["energy", 40000],
    ["card", 450000],
  ]);

  /** Remaining as the month view computes it, with the card set aside. */
  function figures(surplusIds: string[]) {
    const obligations = buildObligations({
      items: [...bills, card],
      planned,
      plans: new Map(),
      settled: new Set(),
      year: 2026, month: 10, splitDay: 15, carryMonths: 0,
    });

    const counted = obligations.filter((o) => !surplusIds.includes(o.lineItemId));
    const setAside = obligations.filter((o) => surplusIds.includes(o.lineItemId));

    const firstRemaining = counted
      .filter((o) => o.half === 0)
      .reduce((s, o) => s + o.amountCents, 0);
    const bothRemaining = counted.reduce((s, o) => s + o.amountCents, 0);

    const balance = 1136600; // $11,366
    return {
      firstRemaining,
      bothRemaining,
      freeAfterFirst: balance - firstRemaining,
      freeAfterBoth: balance - bothRemaining,
      setAsideTotal: setAside.reduce((s, o) => s + o.amountCents, 0),
    };
  }

  it("counts the card against available cash when not flagged", () => {
    const f = figures([]);
    // Mortgage and the card both fall in the first half.
    assert.equal(f.firstRemaining, 264800 + 450000);
    assert.equal(f.freeAfterFirst, 1136600 - 714800);
    assert.equal(f.freeAfterBoth, 1136600 - 754800);
  });

  it("frees that cash once flagged, and reports it separately", () => {
    const f = figures(["card"]);
    assert.equal(f.firstRemaining, 264800);
    assert.equal(f.setAsideTotal, 450000);
    // Both transfer figures rise by exactly the card's planned payment.
    assert.equal(f.freeAfterFirst, 1136600 - 264800);
    assert.equal(f.freeAfterBoth, 1136600 - 304800);
    assert.equal(f.freeAfterBoth - figures([]).freeAfterBoth, 450000);
  });

  it("shows whether the surplus covers the planned payment", () => {
    const f = figures(["card"]);
    const shortfall = f.freeAfterBoth - 450000;
    assert.equal(shortfall, 381800);
    assert.ok(shortfall > 0, "surplus covers it at this balance");
  });
});
