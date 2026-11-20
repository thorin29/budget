import { describe, expect, it } from "vitest";
import { usualFor } from "../usual";

const T = 2026 * 12 + 10; // November 2026
const at = (pairs: Array<[number, number]>) => new Map(pairs.map(([back, c]) => [T - back, c]));

describe("usualFor", () => {
  it("takes the typical month, not the average", () => {
    const months = at([[1, 160_000], ...Array.from({ length: 11 }, (_, i) => [i + 2, 5_000] as [number, number])]);
    expect(usualFor(months, T, T - 24)).toBe(5_000);
  });
  it("counts empty months as nothing", () => {
    expect(usualFor(at([[1, 9_000], [2, 9_000]]), T, T - 12)).toBe(0);
    expect(usualFor(at([[1, 9_000], [2, 9_000]]), T, T - 2)).toBe(9_000);
  });
  it("uses the same month when it ran higher two years running", () => {
    const base: Array<[number, number]> = Array.from({ length: 24 }, (_, i) => [i + 1, 5_000]);
    expect(usualFor(at([...base.filter(([b]) => b !== 12 && b !== 24), [12, 60_000], [24, 40_000]]), T, T - 24)).toBe(40_000);
    // Only once: a one-off, not a season.
    expect(usualFor(at([...base.filter(([b]) => b !== 12), [12, 60_000]]), T, T - 24)).toBe(5_000);
    expect(usualFor(at([[12, 60_000]]), T, T - 12)).toBe(0);
  });
});
