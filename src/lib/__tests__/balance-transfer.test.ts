import { describe, expect, it } from "vitest";
import { isBalanceTransfer } from "../transfers";

describe("isBalanceTransfer", () => {
  it("spots balance transfers however the bank words them", () => {
    expect(isBalanceTransfer("BALANCE TRANSFER")).toBe(true);
    expect(isBalanceTransfer("11/06 BAL TRANSFER 0001")).toBe(true);
    expect(isBalanceTransfer("Bal. xfer from card")).toBe(true);
    expect(isBalanceTransfer("TRANSFER TO SAVINGS")).toBe(false);
    expect(isBalanceTransfer("Balance inquiry fee")).toBe(false);
  });
});
