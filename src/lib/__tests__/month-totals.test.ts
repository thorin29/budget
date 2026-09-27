import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildObligations, utcDate, type LineItemForMonth } from "@/lib/month-model";

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
