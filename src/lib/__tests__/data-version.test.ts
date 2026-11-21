import { describe, expect, it } from "vitest";
import { bumpDataVersion, keepUntilChanged } from "../data-version";

describe("keepUntilChanged", () => {
  it("reuses a result until the data changes", async () => {
    let runs = 0;
    const f = keepUntilChanged("t", async (n: number) => (runs++, n * 2), () => "2026-11-20");
    expect(await f(2)).toBe(4);
    expect(await f(2)).toBe(4);
    expect(runs).toBe(1);
    bumpDataVersion();
    await f(2);
    expect(runs).toBe(2);
    await f(3);
    expect(runs).toBe(3);
  });
  it("doesn't keep a failure", async () => {
    let runs = 0;
    const f = keepUntilChanged("u", async () => { runs++; throw new Error("x"); }, () => "d");
    await expect(f()).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    await expect(f()).rejects.toThrow();
    expect(runs).toBe(2);
  });
});
