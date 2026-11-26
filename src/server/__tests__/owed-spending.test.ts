import { describe, expect, it } from "vitest";
import { everydayParts, type Txn } from "../month-plan";

const txn = (over: Partial<Txn> = {}): Txn => ({
  id: "t",
  accountId: "a",
  postedOn: new Date("2026-11-12T00:00:00Z"),
  amount: "-88.15",
  merchant: "Hardware Store",
  description: "HARDWARE STORE 12",
  categoryId: "home",
  pending: false,
  category: { name: "Home repair", managedForOthers: false },
  account: { type: "CHECKING" } as Txn["account"],
  actual: null,
  splits: [],
  ...over,
});

describe("someone else's share of a charge", () => {
  it("isn't your spending", () => {
    const parts = everydayParts(
      txn({
        splits: [
          { categoryId: "jordan", amount: "-40.00", category: { managedForOthers: true } },
          { categoryId: "home", amount: "-48.15", category: { managedForOthers: false } },
        ],
      }),
      () => false,
      [],
    );
    expect(parts).toEqual([{ categoryId: "home", cents: 4815 }]);
  });

  it("leaves the whole charge out when it's all theirs", () => {
    expect(everydayParts(txn({ splits: [{ categoryId: "jordan", amount: "-88.15", category: { managedForOthers: true } }] }), () => false, [])).toEqual([]);
  });
});

describe("a payment that adds up to charges", () => {
  it("finds the fewest charges that add up exactly", async () => {
    const { chargesAddingUpTo } = await import("../owed");
    const open = [
      { key: "a", cents: 5000 },
      { key: "b", cents: 1230 },
      { key: "c", cents: 7065 },
      { key: "d", cents: 6230 },
    ];
    expect(chargesAddingUpTo(open, 6230)).toEqual(["d"]);
    expect(chargesAddingUpTo(open, 8295)).toEqual(["b", "c"]);
    expect(chargesAddingUpTo(open, 999)).toBeNull();
  });
});
