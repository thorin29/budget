// Every amount here is invented.
import { describe, expect, it } from "vitest";
import { cashTiming, type CashEvent } from "../cash-timing";

const ev = (date: string, label: string, cents: number, kind: CashEvent["kind"] = "bill"): CashEvent => ({ date, label, cents, kind });

describe("cashTiming", () => {
  // A month whose first paycheck lands after the 9th: three payments come before it.
  const events = [
    ev("2026-12-01", "Mortgage", -180_000),
    ev("2026-12-08", "0% card", -28_000, "debt"),
    ev("2026-12-09", "Store card", -40_000, "card"),
    ev("2026-12-10", "Travel card", -250_000, "card"),
    ev("2026-12-11", "Paycheck", 450_000, "pay"),
    ev("2026-12-20", "Electric", -21_000),
    ev("2026-12-25", "Paycheck", 490_000, "pay"),
    ev("2026-11-20", "Water", -9_500),
  ];
  const t = cashTiming({ today: "2026-11-28", until: "2026-12-31", startCents: 400_000, events });

  it("runs the balance and finds the first day it goes short, ahead of time", () => {
    expect(t.steps[0]).toMatchObject({ label: "Water", date: "2026-11-28", overdue: true, balanceCents: 390_500 });
    expect(t.shortOn).toBe("2026-12-10");
    expect(t.lowCents).toBe(390_500 - 180_000 - 28_000 - 40_000 - 250_000);
    expect(t.lowOn).toBe("2026-12-10");
  });

  it("lists what each paycheck has to pay, in whole payments", () => {
    expect(t.spans.map((s) => [s.from, s.to, s.payCents, s.outCents])).toEqual([
      ["2026-11-28", "2026-12-11", 0, 507_500],
      ["2026-12-11", "2026-12-25", 450_000, 21_000],
      ["2026-12-25", "2026-12-31", 490_000, 0],
    ]);
    expect(t.spans[1].endCents).toBe(t.lowCents + 450_000 - 21_000);
  });

  it("puts pay before bills on the same day", () => {
    const same = cashTiming({ today: "2026-12-01", until: "2026-12-31", startCents: 0, events: [ev("2026-12-05", "Phone", -5_000), ev("2026-12-05", "Paycheck", 10_000, "pay")] });
    expect(same.shortOn).toBeNull();
  });
});
