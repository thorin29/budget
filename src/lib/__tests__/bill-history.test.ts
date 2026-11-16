// Every bill and amount here is invented.
import { describe, expect, it } from "vitest";
import { exactMatch, learnedDueDay, pairRecorded, shouldMoveDueDay, type RecordedEntry } from "../bill-history";
import type { MatchTxn } from "../bill-match";

const entry = (over: Partial<RecordedEntry> = {}): RecordedEntry => ({
  actualId: "a1", lineItemId: "car", year: 2026, month: 10, income: false, amountCents: 41_200, paidOn: null, dueDay: 20, ...over,
});
const txn = (over: Partial<MatchTxn> = {}): MatchTxn => ({
  id: "t1", postedOn: "2026-10-19", amountCents: -41_200, merchant: "Transfer", description: "XFER OUT", merchantKey: "k", ...over,
});

describe("pairRecorded", () => {
  it("pairs a recorded payment with its charge by amount and date", () => {
    expect(pairRecorded([entry()], [txn()])).toEqual([{ actualId: "a1", lineItemId: "car", txnId: "t1" }]);
    expect(pairRecorded([entry({ paidOn: "2026-10-17" })], [txn()])).toHaveLength(1);
  });

  it("skips anything ambiguous, far off, or the wrong way", () => {
    expect(pairRecorded([entry()], [txn(), txn({ id: "t2", postedOn: "2026-10-22" })])).toEqual([]);
    expect(pairRecorded([entry(), entry({ actualId: "a2", lineItemId: "other" })], [txn()])).toEqual([]);
    expect(pairRecorded([entry({ paidOn: "2026-10-01" })], [txn()])).toEqual([]);
    expect(pairRecorded([entry()], [txn({ amountCents: 41_200 })])).toEqual([]);
    expect(pairRecorded([entry()], [txn({ amountCents: -45_000 })])).toEqual([]);
  });
});

describe("due days", () => {
  it("learns the posting day from three or more steady months", () => {
    expect(learnedDueDay(["2026-08-18", "2026-09-17", "2026-10-19"])).toBe(18);
    expect(learnedDueDay(["2026-09-17", "2026-10-19"])).toBeNull();
    expect(learnedDueDay(["2026-08-02", "2026-09-17", "2026-10-28"])).toBeNull();
  });

  it("moves only when the difference matters", () => {
    expect(shouldMoveDueDay(14, 18)).toBe(true);
    expect(shouldMoveDueDay(17, 18)).toBe(false);
    expect(shouldMoveDueDay(null, 18)).toBe(true);
    expect(shouldMoveDueDay(14, null)).toBe(false);
  });
});

describe("exactMatch", () => {
  it("needs a known merchant and the planned or last amount", () => {
    expect(exactMatch({ knownMerchant: true, amountCents: 150_000, budgetedCents: 150_000, lastPaidCents: null })).toBe(true);
    expect(exactMatch({ knownMerchant: true, amountCents: 152_310, budgetedCents: 150_000, lastPaidCents: 152_310 })).toBe(true);
    expect(exactMatch({ knownMerchant: true, amountCents: 160_000, budgetedCents: 150_000, lastPaidCents: 152_310 })).toBe(false);
    expect(exactMatch({ knownMerchant: false, amountCents: 150_000, budgetedCents: 150_000, lastPaidCents: null })).toBe(false);
  });
});
