import { describe, expect, it } from "vitest";
import { parseDay, parseEnteredAt } from "../api-dates";

describe("parseDay", () => {
  it("reads a calendar day only", () => {
    expect(parseDay("2026-11-21")?.toISOString()).toBe("2026-11-21T00:00:00.000Z");
    expect(parseDay("2026-11-21T10:00:00Z")).toBeUndefined();
    expect(parseDay(20261121)).toBeUndefined();
  });
});

describe("parseEnteredAt", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  it("reads an ISO timestamp", () => {
    expect(parseEnteredAt("2026-11-13T11:00:00Z", now)?.toISOString()).toBe("2026-11-13T11:00:00.000Z");
  });
  it("ignores junk and a clock far in the future", () => {
    expect(parseEnteredAt("soon", now)).toBeUndefined();
    expect(parseEnteredAt("2026-11-20T00:00:00Z", now)).toBeUndefined();
    expect(parseEnteredAt(undefined, now)).toBeUndefined();
  });
});
