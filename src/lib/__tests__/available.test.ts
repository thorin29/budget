import { describe, expect, it } from "vitest";
import { available } from "../available";

describe("available", () => {
  it("is the lowest point, with the bill that sets it", () => {
    const a = available({
      startCents: 263_200,
      until: "2026-12-17",
      events: [
        { date: "2026-12-01", name: "VA", cents: 176_400 },
        { date: "2026-12-01", name: "Mortgage", cents: -300_000 },
        { date: "2026-12-04", name: "Pay", cents: 430_000 },
        { date: "2026-12-10", name: "Car", cents: -50_000 },
      ],
    });
    // Pay lands before a bill the same day: 263,200 + 176,400 − 300,000 = 139,600.
    expect(a.cents).toBe(139_600);
    expect(a.limit?.name).toBe("Mortgage");
    expect(a.endCents).toBe(519_600);
    expect(a.shortCents).toBe(0);
  });

  it("is the carry-over itself when nothing later goes lower", () => {
    const a = available({ startCents: 50_000, until: "2026-12-17", events: [{ date: "2026-12-04", name: "Pay", cents: 100_000 }] });
    expect(a.cents).toBe(50_000);
    expect(a.limit).toBeNull();
  });

  it("reports how short it already is, and never goes below zero", () => {
    const a = available({ startCents: 10_000, until: "2026-12-17", events: [{ date: "2026-12-01", name: "Rent", cents: -30_000 }] });
    expect(a.cents).toBe(0);
    expect(a.shortCents).toBe(20_000);
    expect(a.limit?.name).toBe("Rent");
  });
});
