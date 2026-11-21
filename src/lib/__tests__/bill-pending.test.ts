import { describe, expect, it } from "vitest";
import { matchPendingBills } from "../bill-pending";

const history = new Map([["car", [{ merchant: "Acme Loan Xfer", cents: 41_002 }]]]);
const bill = { key: "car:2026:11", lineItemId: "car", dueOn: "2026-11-21", budgetedCents: 41_000 };
const charge = (over: Partial<{ id: string; merchant: string; cents: number; postedOn: string; pending: boolean }> = {}) => ({ id: "t1", merchant: "ACME loan  xfer", cents: 41_002, postedOn: "2026-11-20", pending: true, ...over });

describe("matchPendingBills", () => {
  it("a pending payment from the bill's usual merchant", () => {
    expect(matchPendingBills([bill], [charge()], history).get(bill.key)).toMatchObject({ txnId: "t1", pending: true });
  });
  it("not another merchant, a far-off amount, or a date outside the window", () => {
    expect(matchPendingBills([bill], [charge({ merchant: "Corner Store" })], history).size).toBe(0);
    expect(matchPendingBills([bill], [charge({ cents: 9_000 })], history).size).toBe(0);
    expect(matchPendingBills([bill], [charge({ postedOn: "2026-12-15" })], history).size).toBe(0);
  });
  it("a bill with no recorded payments isn't guessed", () => {
    expect(matchPendingBills([{ ...bill, lineItemId: "new" }], [charge()], history).size).toBe(0);
  });
});
