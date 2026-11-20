import { describe, expect, it } from "vitest";
import { blend } from "../home-value";

const now = Date.parse("2026-11-20T00:00:00Z");
describe("home value blend", () => {
  it("averages current estimates, RentCast included", () => {
    const b = blend({ estimates: [{ source: "Zillow", cents: 400_000_00, on: "2026-10-01" }, { source: "Redfin", cents: 380_000_00, on: "2026-10-01" }], valueCents: 420_000_00, fetchedAt: "2026-11-10T00:00:00Z" }, now);
    expect(b.cents).toBe(400_000_00);
    expect(b.used).toEqual(["Zillow", "Redfin", "RentCast"]);
  });
  it("drops stale site estimates but keeps a county value for 15 months", () => {
    const b = blend({ estimates: [{ source: "Zillow", cents: 300_000_00, on: "2025-09-01" }, { source: "County appraisal", cents: 350_000_00, on: "2025-12-01" }], valueCents: 410_000_00, fetchedAt: "2026-11-01T00:00:00Z" }, now);
    expect(b.used).toEqual(["County appraisal", "RentCast"]);
    expect(b.cents).toBe(380_000_00);
  });
  it("falls back to the newest when nothing is current", () => {
    const b = blend({ estimates: [{ source: "Zillow", cents: 300_000_00, on: "2024-01-01" }], valueCents: 310_000_00, fetchedAt: "2025-01-01T00:00:00Z" }, now);
    expect(b).toEqual({ cents: 310_000_00, used: ["RentCast"] });
  });
  it("counts a past value only while it's current, and each source once with its newest", () => {
    const b = blend({ estimates: [{ source: "Zillow", cents: 400_000_00, on: "2026-10-01" }], valueCents: null, fetchedAt: null, history: [
      { source: "County appraisal", cents: 340_000_00, on: "2025-01-01", yearOnly: true },
      { source: "County appraisal", cents: 360_000_00, on: "2026-01-01", yearOnly: true },
      { source: "Zillow", cents: 390_000_00, on: "2026-05-01" },
    ] }, now);
    expect(b.used).toEqual(["Zillow", "County appraisal"]);
    expect(b.cents).toBe(380_000_00);
  });
});
