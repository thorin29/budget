// Every bill, merchant and amount here is invented.
import { describe, expect, it } from "vitest";
import { coveredByRecorded, findRepeats, suggestMatches, tokens, type MatchBill, type MatchTxn } from "../bill-match";

const bill = (over: Partial<MatchBill> = {}): MatchBill => ({
  lineItemId: "electric",
  year: 2026,
  month: 11,
  name: "Electric",
  kind: "BILL",
  dueDay: 14,
  budgetedCents: 17_240,
  ...over,
});
const txn = (over: Partial<MatchTxn> = {}): MatchTxn => ({
  id: "t1",
  postedOn: "2026-11-12",
  amountCents: -16_892,
  merchant: "Community Electric Co-op",
  description: "COMMUNITY ELECTRIC CO-OP 0042",
  merchantKey: "k-electric",
  ...over,
});

describe("suggestMatches", () => {
  it("matches on a shared word, amount in range, date near the due day", () => {
    expect(suggestMatches([bill()], [txn()], new Map(), new Set())).toEqual([
      { lineItemId: "electric", year: 2026, month: 11, txnId: "t1", confidence: "high", reason: "name" },
    ]);
  });

  it("uses a merchant confirmed before, even with no shared word", () => {
    const rules = new Map([["k-power", new Set(["electric"])]]);
    const s = suggestMatches([bill()], [txn({ merchant: "Regional Power", description: "RPWR", merchantKey: "k-power" })], rules, new Set());
    expect(s[0]?.reason).toBe("confirmed before");
  });

  it("offers an exact amount alone as a medium match", () => {
    const s = suggestMatches([bill({ name: "Car loan", budgetedCents: 68_940 })], [txn({ amountCents: -68_940, merchant: "Transfer", description: "XFER OUT 0005" })], new Map(), new Set());
    expect(s[0]).toMatchObject({ confidence: "medium", reason: "exact amount" });
  });

  it("ignores wrong direction, far dates, out-of-range amounts and dismissed pairs", () => {
    expect(suggestMatches([bill()], [txn({ amountCents: 16_892 })], new Map(), new Set())).toEqual([]);
    expect(suggestMatches([bill()], [txn({ postedOn: "2026-10-01" })], new Map(), new Set())).toEqual([]);
    expect(suggestMatches([bill()], [txn({ amountCents: -40_000 })], new Map(), new Set())).toEqual([]);
    expect(suggestMatches([bill()], [txn()], new Map(), new Set(["electric:t1"]))).toEqual([]);
  });

  it("matches income to money in", () => {
    const s = suggestMatches([bill({ lineItemId: "pay", name: "Paycheck", kind: "INCOME", budgetedCents: 425_000, dueDay: 14 })], [txn({ amountCents: 425_000, merchant: "Payroll", description: "PAYROLL DIRECT DEP" })], new Map(), new Set());
    expect(s[0]).toMatchObject({ lineItemId: "pay", reason: "exact amount" });
  });

  it("gives each transaction to one bill and each bill one transaction", () => {
    const bills = [bill({ lineItemId: "a", name: "Gym", budgetedCents: 4_000 }), bill({ lineItemId: "b", name: "Gym", budgetedCents: 4_000, month: 11 })];
    const txns = [txn({ id: "x", merchant: "Gym", description: "GYM", amountCents: -4_000 })];
    expect(suggestMatches(bills, txns, new Map(), new Set())).toHaveLength(1);
  });

  it("pays the oldest unpaid month of a bill first", () => {
    const oct = bill({ lineItemId: "giving", name: "Giving", month: 10, dueDay: 25, budgetedCents: 20_000, overdue: true });
    const nov = bill({ lineItemId: "giving", name: "Giving", month: 11, dueDay: 25, budgetedCents: 20_000 });
    const t = txn({ id: "g", postedOn: "2026-11-02", amountCents: -20_000, merchant: "Giving", description: "GIVING" });
    expect(suggestMatches([nov, oct], [t], new Map(), new Set())).toEqual([
      expect.objectContaining({ lineItemId: "giving", month: 10, txnId: "g" }),
    ]);
  });

  it("matches an overdue bill well after its due day", () => {
    const late = bill({ month: 9, dueDay: 14, overdue: true });
    expect(suggestMatches([late], [txn({ postedOn: "2026-10-20" })], new Map(), new Set())).toHaveLength(1);
    expect(suggestMatches([{ ...late, overdue: false }], [txn({ postedOn: "2026-10-20" })], new Map(), new Set())).toEqual([]);
  });

  it("tokenizes without noise words or numbers", () => {
    expect([...tokens("ONLINE PAYMENT to Example Water 1234")]).toEqual(["example", "water"]);
  });
});

describe("coveredByRecorded", () => {
  const paid = { lineItemId: "giving", year: 2026, month: 10, amountCents: 20_000, paidOn: null, createdOn: "2026-11-05" };
  const t = txn({ id: "g", postedOn: "2026-11-02", amountCents: -20_000 });

  it("covers a late charge already recorded by hand for the month before", () => {
    expect([...coveredByRecorded([paid], [t])]).toEqual(["giving:g"]);
    expect([...coveredByRecorded([{ ...paid, createdOn: "2026-10-20", paidOn: "2026-10-31" }], [t])]).toEqual(["giving:g"]);
  });

  it("leaves other amounts and unrelated timing alone", () => {
    expect(coveredByRecorded([{ ...paid, amountCents: 25_000 }], [t]).size).toBe(0);
    expect(coveredByRecorded([{ ...paid, createdOn: "2026-10-01" }], [t]).size).toBe(0);
  });
});

describe("findRepeats", () => {
  const r = (postedOn: string, amountCents: number, merchantKey = "k") => ({ postedOn, amountCents, merchant: "StreamBox", merchantKey });

  it("finds a monthly charge at a steady amount and day", () => {
    expect(findRepeats([r("2026-08-09", -1_549), r("2026-09-09", -1_549), r("2026-10-10", -1_549), r("2026-11-09", -1_549)])).toEqual([
      { merchantKey: "k", merchant: "StreamBox", typicalCents: 1_549, typicalDay: 9, months: 4, lastOn: "2026-11-09" },
    ]);
  });

  it("skips scattered amounts, scattered days and too few months", () => {
    expect(findRepeats([r("2026-08-09", -1_000), r("2026-09-09", -3_000), r("2026-10-09", -1_000)])).toEqual([]);
    expect(findRepeats([r("2026-08-02", -1_000), r("2026-09-20", -1_000), r("2026-10-09", -1_000)])).toEqual([]);
    expect(findRepeats([r("2026-09-09", -1_000), r("2026-10-09", -1_000)])).toEqual([]);
  });
});
