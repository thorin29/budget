import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseCents } from "@/lib/money";

describe("currency field round trip", () => {
  it("accepts what the formatted balance field submits", () => {
    assert.equal(parseCents("$5,481.00"), 548100);
    assert.equal(parseCents("$10,000.00"), 1000000);
    assert.equal(parseCents("5481"), 548100);
    assert.equal(parseCents("5,481.37"), 548137);
    assert.equal(parseCents("$0.00"), 0);
  });
});
