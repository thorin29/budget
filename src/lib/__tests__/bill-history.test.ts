// Every bill and amount here is invented.
import { describe, expect, it } from "vitest";
import { anyDayMonths, knownMatch, learnedDueDay, paidAnyDay, pairRecorded, shouldMoveDueDay, type RecordedEntry } from "../bill-history";
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

  it("pairs a varying bill by name at a different amount", () => {
    const utility = entry({ lineItemId: "power", name: "Electric", amountCents: 18_000 });
    expect(pairRecorded([utility], [txn({ amountCents: -14_250, merchant: "Example Electric Co-op" })])).toHaveLength(1);
    expect(pairRecorded([utility], [txn({ amountCents: -14_250, merchant: "Somewhere Else" })])).toEqual([]);
  });

  it("skips anything ambiguous, far off, or the wrong way", () => {
    expect(pairRecorded([entry()], [txn(), txn({ id: "t2", postedOn: "2026-10-22" })])).toEqual([]);
    expect(pairRecorded([entry(), entry({ actualId: "a2", lineItemId: "other" })], [txn()])).toEqual([]);
    expect(pairRecorded([entry({ paidOn: "2026-10-01" })], [txn()])).toEqual([]);
    expect(pairRecorded([entry()], [txn({ amountCents: 41_200 })])).toEqual([]);
    expect(pairRecorded([entry()], [txn({ amountCents: -45_000 })])).toEqual([]);
  });
});

describe("pairRecorded across history", () => {
  it("settles a monthly chain by month", () => {
    const va = (month: number) => entry({ actualId: `v${month}`, lineItemId: "va", month, amountCents: 155_000, income: true, dueDay: null, name: "Pension" });
    const dep = (id: string, postedOn: string) => txn({ id, postedOn, amountCents: 155_000, merchant: "Pension Deposit" });
    const pairs = pairRecorded([va(1), va(2), va(3)], [dep("d0", "2025-12-30"), dep("d1", "2026-01-29"), dep("d2", "2026-02-26"), dep("d3", "2026-03-31")].map((t) => ({ ...t, postedOn: t.postedOn })));
    // Entries are 2026 by default via entry(): year 2026.
    expect(pairs.map((p) => `${p.actualId}:${p.txnId}`).sort()).toEqual(["v1:d1", "v2:d2", "v3:d3"]);
  });

  it("needs the bill's name or merchant for round small amounts", () => {
    const crypto = entry({ lineItemId: "crypto", name: "Crypto", amountCents: 3_500, dueDay: 23 });
    expect(pairRecorded([crypto], [txn({ amountCents: -3_500, merchant: "Dollar Tree", postedOn: "2026-10-22" })])).toEqual([]);
    expect(pairRecorded([{ ...crypto, knownKeys: ["cb"] }], [txn({ amountCents: -3_500, merchant: "Transfer to Exchange", merchantKey: "cb", postedOn: "2026-10-22" })])).toHaveLength(1);
  });

  it("prefers the charge that names the bill", () => {
    const pest = entry({ lineItemId: "pest", name: "Pest Control", amountCents: 16_000, dueDay: 28 });
    const pairs = pairRecorded([pest], [txn({ id: "h", amountCents: -16_000, merchant: "Example Pest Co", postedOn: "2026-10-08" }), txn({ id: "x", amountCents: -16_000, merchant: "Sports Shop", postedOn: "2026-10-27" })]);
    expect(pairs.map((p) => p.txnId)).toEqual(["h"]);
  });
});

describe("due days", () => {
  it("learns the posting day from three or more steady months", () => {
    expect(learnedDueDay(["2026-08-18", "2026-09-17", "2026-10-19"])).toBe(18);
    expect(learnedDueDay(["2026-09-17", "2026-10-19"])).toBeNull();
    expect(learnedDueDay(["2026-08-02", "2026-09-17", "2026-10-28"])).toBeNull();
    // Drifting within a week: the middle day.
    expect(learnedDueDay(["2026-05-12", "2026-06-15", "2026-07-18", "2026-08-14", "2026-09-17", "2026-10-13"])).toBe(15);
    // Moved recently: the latest three decide.
    expect(learnedDueDay(["2026-05-03", "2026-06-04", "2026-07-02", "2026-08-22", "2026-09-21", "2026-10-23"])).toBe(22);
  });

  it("moves only when the difference matters", () => {
    expect(shouldMoveDueDay(14, 18)).toBe(true);
    expect(shouldMoveDueDay(17, 18)).toBe(false);
    expect(shouldMoveDueDay(null, 18)).toBe(true);
    expect(shouldMoveDueDay(14, null)).toBe(false);
  });
});

describe("knownMatch", () => {
  it("goes by the merchant, not the amount", () => {
    expect(knownMatch({ knownMerchant: true })).toBe(true);
    expect(knownMatch({ knownMerchant: false })).toBe(false);
  });
  it("records an exact-to-the-cent payment of a larger bill from a new merchant", () => {
    expect(knownMatch({ knownMerchant: false, amountCents: 105_000, budgetedCents: 105_000 })).toBe(true);
    expect(knownMatch({ knownMerchant: false, amountCents: 101_000, budgetedCents: 105_000 })).toBe(false);
    expect(knownMatch({ knownMerchant: false, amountCents: 5_000, budgetedCents: 5_000 })).toBe(false);
    expect(knownMatch({ knownMerchant: false, amountCents: 105_000, budgetedCents: 105_000, peerPayment: true })).toBe(false);
  });
});

describe("anyDayMonths", () => {
  const p = (id: string, postedOn: string, current: string) => ({ id, postedOn, current });

  it("counts each payment for the month it was made, and a first-week payment for an unpaid month before", () => {
    // Recorded one month ahead; a late payment on the 2nd and the month's own on the 20th.
    const got = anyDayMonths(
      [p("a", "2026-08-26", "2026-09"), p("b", "2026-09-29", "2026-10"), p("c", "2026-11-02", "2026-11"), p("d", "2026-11-20", "2026-12")],
      new Set(["2026-07"]),
      new Set(),
    );
    expect(Object.fromEntries(got)).toEqual({ a: "2026-08", b: "2026-09", c: "2026-10", d: "2026-11" });
  });

  it("takes over a month recorded by hand with no charge, and leaves a paid month before alone", () => {
    const got = anyDayMonths([p("a", "2025-10-28", "2025-11"), p("b", "2025-12-03", "2025-12")], new Set(["2025-10", "2025-11"]), new Set(["2025-10"]));
    expect(Object.fromEntries(got)).toEqual({ a: "2025-10", b: "2025-12" });
  });

  it("is for bills with no due day", () => {
    expect(paidAnyDay(null)).toBe(true);
    expect(paidAnyDay(1)).toBe(false);
  });
});
