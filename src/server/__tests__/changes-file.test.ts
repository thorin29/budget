import { describe, expect, it } from "vitest";
import { parseChanges } from "../changes-file";

describe("parseChanges", () => {
  it("reads a changes file", () => {
    const f = parseChanges(JSON.stringify({ kind: "budget-changes", version: 1, ops: [{ op: "renameCategory", category: "Dining", name: "Restaurants" }, { op: "markTransfer", transactionIds: ["t1"] }] }));
    expect(f.ops).toHaveLength(2);
  });
  it("turns away anything else", () => {
    expect(() => parseChanges("not json")).toThrow();
    expect(() => parseChanges(JSON.stringify({ kind: "budget-changes", version: 1, ops: [{ op: "dropTables" }] }))).toThrow();
    expect(() => parseChanges(JSON.stringify({ kind: "other", version: 1, ops: [] }))).toThrow();
  });
});
