import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { project, maxSafePaymentCents } from "@/lib/projection";
import { utcDate, type Obligation } from "@/lib/month-model";
import { toCents, toDecimalString, parseCents, sumCents, formatCents } from "@/lib/money";

// ---------------------------------------------------------------- helpers

function bill(
  name: string,
  amountCents: number,
  year: number,
  month: number,
  day: number,
): Obligation {
  return {
    lineItemId: name,
    name,
    amountCents,
    year,
    month,
    dueDate: utcDate(year, month, day),
    half: day <= 15 ? 0 : 1,
    carriedOver: false,
  };
}

function pay(name: string, amountCents: number, year: number, month: number, day: number) {
  return { lineItemId: name, name, amountCents, date: utcDate(year, month, day) };
}

const ASOF = utcDate(2026, 9, 26);

// ---------------------------------------------------------------- money

describe("money", () => {
  it("converts fixed decimal strings to cents exactly", () => {
    assert.equal(toCents("1234.56"), 123456);
    assert.equal(toCents("0.01"), 1);
    assert.equal(toCents("0.10"), 10);
    assert.equal(toCents("1000"), 100000);
    assert.equal(toCents("-45.99"), -4599);
  });

  it("handles the classic float traps without drift", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in cents it is exact.
    assert.equal(sumCents([toCents("0.10"), toCents("0.20")]), toCents("0.30"));
    // A hundred repetitions of a third of a dollar.
    const many = Array.from({ length: 100 }, () => toCents("0.33"));
    assert.equal(sumCents(many), 3300);
  });

  it("rounds beyond two decimal places away from zero", () => {
    assert.equal(toCents("1.005"), 101);
    assert.equal(toCents("1.004"), 100);
  });

  it("round-trips through the decimal string form", () => {
    for (const value of ["0.00", "0.07", "12.30", "9999999.99"]) {
      assert.equal(toDecimalString(toCents(value)), value);
    }
  });

  it("handles the largest value Decimal(12,2) can hold", () => {
    const max = "9999999999.99";
    const cents = toCents(max);
    assert.equal(cents, 999999999999);
    assert.equal(toDecimalString(cents), max);
    // Still an exact integer, comfortably inside Number.MAX_SAFE_INTEGER.
    assert.ok(Number.isSafeInteger(cents));
  });

  it("parses user input", () => {
    assert.equal(parseCents("$1,234.56"), 123456);
    assert.equal(parseCents(" 400 "), 40000);
    assert.throws(() => parseCents(""));
    assert.throws(() => parseCents("abc"));
  });

  it("rejects fractional cents", () => {
    assert.throws(() => toDecimalString(10.5));
    assert.throws(() => sumCents([1, 2.5]));
  });

  it("formats for display", () => {
    assert.equal(formatCents(123456), "$1,234.56");
    assert.equal(formatCents(0), "$0.00");
  });
});

// ---------------------------------------------------------------- projection

describe("projection", () => {
  it("returns the opening balance when nothing is scheduled", () => {
    const p = project({
      openingBalanceCents: 100000,
      asOf: ASOF,
      obligations: [],
      income: [],
    });
    assert.equal(p.lowPoint.balanceCents, 100000);
    assert.equal(p.safeToPayCents, 100000);
    assert.equal(p.shortfall, false);
    assert.equal(p.nextPayDate, null);
  });

  it("finds the low point after a payday, not merely before the next one", () => {
    // The trap this engine exists to avoid: plenty of room before the next
    // paycheck, then a cluster of fixed bills at the start of the next month.
    const p = project({
      openingBalanceCents: 1000000, // $10,000
      asOf: ASOF,
      obligations: [
        bill("early", 260000, 2026, 10, 1),
        bill("also early", 100000, 2026, 10, 1),
        bill("mid", 40000, 2026, 10, 6),
      ],
      income: [pay("check", 430000, 2026, 10, 9)],
    });

    assert.equal(p.lowPoint.balanceCents, 600000);
    assert.equal(p.lowPoint.date.getTime(), utcDate(2026, 10, 6).getTime());
    // Naively subtracting only what is due before the next payday would say
    // $10,000 is available; the true constraint is $6,000.
    assert.equal(p.safeToPayCents, 600000);
  });

  it("treats an overdue bill as owed today", () => {
    const p = project({
      openingBalanceCents: 50000,
      asOf: ASOF,
      obligations: [bill("late", 15000, 2026, 9, 16)],
      income: [],
    });
    assert.equal(p.days[0].date.getTime(), ASOF.getTime());
    assert.equal(p.days[0].balanceCents, 35000);
  });

  it("combines several events falling on one date", () => {
    const p = project({
      openingBalanceCents: 100000,
      asOf: ASOF,
      obligations: [
        bill("a", 10000, 2026, 10, 1),
        bill("b", 20000, 2026, 10, 1),
      ],
      income: [pay("check", 50000, 2026, 10, 1)],
    });
    const day = p.days.find((d) => d.date.getTime() === utcDate(2026, 10, 1).getTime());
    assert.ok(day);
    assert.equal(day.outCents, 30000);
    assert.equal(day.inCents, 50000);
    assert.equal(day.balanceCents, 120000);
    assert.equal(day.events.length, 3);
  });

  it("reports a shortfall when the balance goes negative", () => {
    const p = project({
      openingBalanceCents: 10000,
      asOf: ASOF,
      obligations: [bill("big", 50000, 2026, 10, 1)],
      income: [],
    });
    assert.equal(p.shortfall, true);
    assert.equal(p.lowPoint.balanceCents, -40000);
    // Never advise paying anything when already short.
    assert.equal(p.safeToPayCents, 0);
  });

  it("crosses a year boundary", () => {
    const p = project({
      openingBalanceCents: 500000,
      asOf: utcDate(2026, 12, 20),
      obligations: [bill("january", 300000, 2027, 1, 2)],
      income: [],
      horizonDays: 45,
    });
    assert.equal(p.lowPoint.balanceCents, 200000);
    assert.equal(p.lowPoint.date.getTime(), utcDate(2027, 1, 2).getTime());
  });

  it("includes an event on the final day of the horizon and excludes the next", () => {
    const inside = project({
      openingBalanceCents: 100000,
      asOf: ASOF,
      obligations: [bill("edge", 10000, 2026, 11, 10)], // asOf + 45 days
      income: [],
      horizonDays: 45,
    });
    assert.equal(inside.lowPoint.balanceCents, 90000);

    const outside = project({
      openingBalanceCents: 100000,
      asOf: ASOF,
      obligations: [bill("beyond", 10000, 2026, 11, 11)],
      income: [],
      horizonDays: 45,
    });
    assert.equal(outside.lowPoint.balanceCents, 100000);
  });

  it("ignores a zero-amount obligation's effect on the balance", () => {
    const p = project({
      openingBalanceCents: 100000,
      asOf: ASOF,
      obligations: [bill("nothing", 0, 2026, 10, 1)],
      income: [],
    });
    assert.equal(p.lowPoint.balanceCents, 100000);
  });

  it("subtracts a buffer from what is safe to pay", () => {
    const p = project({
      openingBalanceCents: 100000,
      asOf: ASOF,
      obligations: [],
      income: [],
      bufferCents: 25000,
    });
    assert.equal(p.lowPoint.balanceCents, 100000);
    assert.equal(p.safeToPayCents, 75000);
  });

  it("accounts for a proposed payment", () => {
    const base = {
      openingBalanceCents: 100000,
      asOf: ASOF,
      obligations: [bill("later", 30000, 2026, 10, 5)],
      income: [],
    };

    assert.equal(maxSafePaymentCents(base), 70000);

    const withPayment = project({
      ...base,
      proposedPayment: { amountCents: 70000 },
    });
    assert.equal(withPayment.lowPoint.balanceCents, 0);
    assert.equal(withPayment.shortfall, false);

    const tooMuch = project({
      ...base,
      proposedPayment: { amountCents: 70001 },
    });
    assert.equal(tooMuch.shortfall, true);
  });

  it("reports what is committed before the next payday", () => {
    const p = project({
      openingBalanceCents: 100000,
      asOf: ASOF,
      obligations: [
        bill("before", 20000, 2026, 9, 28),
        bill("after", 50000, 2026, 10, 15),
      ],
      income: [pay("check", 300000, 2026, 10, 9)],
    });
    assert.equal(p.committedBeforeNextPayCents, 20000);
    assert.equal(p.nextPayDate?.getTime(), utcDate(2026, 10, 9).getTime());
  });

  it("stays exact across many small amounts", () => {
    // Thirty bills of $0.07 — floating point would drift here.
    const obligations = Array.from({ length: 30 }, (_, i) =>
      bill(`small-${i}`, 7, 2026, 10, 1),
    );
    const p = project({
      openingBalanceCents: 1000,
      asOf: ASOF,
      obligations,
      income: [],
    });
    assert.equal(p.lowPoint.balanceCents, 1000 - 210);
  });
});
