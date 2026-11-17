/**
 * Finds the bank transaction that probably paid a bill, so the month can say
 * "looks paid" and the person confirms it. Never records anything itself.
 *
 * A match needs the right direction (money out for a bill, in for income), a
 * date near the due day, and an amount in range. On top of that it needs one
 * reason to believe it: a merchant the person already confirmed for this bill,
 * a word shared between the bill's name and the merchant, or an amount to the
 * cent. Each bill takes at most one transaction and each transaction pays at
 * most one bill; the strongest pairs are chosen first. When a bill has an
 * unpaid earlier month, a charge pays the oldest month first: a bill paid
 * late usually is the late month's payment.
 */

export interface MatchBill {
  lineItemId: string;
  year: number;
  month: number;
  name: string;
  kind: "BILL" | "SETTLEMENT" | "INCOME";
  dueDay: number | null;
  budgetedCents: number;
  /** An unpaid month carried from before; it can be paid any time after. */
  overdue?: boolean;
  /** The bill's category name, to match charges in the same category. */
  category?: string | null;
}

export interface MatchTxn {
  id: string;
  /** YYYY-MM-DD */
  postedOn: string;
  /** Negative is money out. */
  amountCents: number;
  merchant: string;
  description: string;
  merchantKey: string;
  /** The charge's category name. */
  category?: string | null;
}

export interface Suggestion {
  lineItemId: string;
  year: number;
  month: number;
  txnId: string;
  confidence: "high" | "medium";
  reason: "confirmed before" | "name" | "category" | "exact amount";
}

const STOP = new Set(["the", "and", "for", "bill", "payment", "pymt", "pmt", "autopay", "online", "monthly", "inc", "llc", "co", "corp"]);

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)),
  );
}

const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

function dueIso(bill: MatchBill): string {
  const last = new Date(Date.UTC(bill.year, bill.month, 0)).getUTCDate();
  const d = Math.min(bill.dueDay ?? 15, last);
  return `${bill.year}-${String(bill.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const WINDOW_BEFORE = 12;
export const WINDOW_AFTER = 12;
/** How long after its due day an overdue bill can still be matched. */
export const WINDOW_OVERDUE = 45;

/** Both in the same category, by name (case aside). */
function sameCategory(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function suggestMatches(
  bills: MatchBill[],
  txns: MatchTxn[],
  rules: Map<string, Set<string>>,
  dismissed: Set<string>,
): Suggestion[] {
  const options: Array<Suggestion & { score: number; gap: number }> = [];
  for (const bill of bills) {
    if (bill.budgetedCents <= 0) continue;
    const due = day(dueIso(bill));
    const income = bill.kind === "INCOME";
    // Without a due day, the whole month is fair game.
    const before = bill.dueDay ? WINDOW_BEFORE : 20;
    const after = bill.overdue ? WINDOW_OVERDUE : bill.dueDay ? WINDOW_AFTER : 20;
    const billWords = tokens(bill.name);
    for (const t of txns) {
      if (income ? t.amountCents <= 0 : t.amountCents >= 0) continue;
      if (dismissed.has(`${bill.lineItemId}:${t.id}`)) continue;
      const gap = day(t.postedOn) - due;
      if (gap < -before || gap > after) continue;
      const amount = Math.abs(t.amountCents);
      const diff = Math.abs(amount - bill.budgetedCents);
      const inRange = diff <= 500 || (amount >= bill.budgetedCents * 0.6 && amount <= bill.budgetedCents * 1.4);
      if (!inRange) continue;
      const exact = diff <= 50;
      const known = rules.get(t.merchantKey)?.has(bill.lineItemId) ?? false;
      const merchantWords = tokens(`${t.merchant} ${t.description}`);
      const named = [...billWords].some((w) => merchantWords.has(w));

      let score = 0;
      let reason: Suggestion["reason"] | null = null;
      if (known) [score, reason] = [100, "confirmed before"];
      else if (named) [score, reason] = [70, "name"];
      else if (sameCategory(bill.category, t.category)) [score, reason] = [50, "category"];
      else if (exact && bill.budgetedCents >= 1_500) [score, reason] = [40, "exact amount"];
      if (!reason) continue;
      if (exact) score += 10;
      score -= Math.min(Math.abs(gap), 12);
      options.push({
        lineItemId: bill.lineItemId,
        year: bill.year,
        month: bill.month,
        txnId: t.id,
        confidence: score >= 55 ? "high" : "medium",
        reason,
        score,
        gap: Math.abs(gap),
      });
    }
  }
  // The same charge and bill in two months: keep the oldest month only.
  const oldest = new Map<string, number>();
  for (const o of options) {
    const k = `${o.txnId}:${o.lineItemId}`;
    oldest.set(k, Math.min(oldest.get(k) ?? Infinity, o.year * 12 + o.month));
  }
  const kept = options.filter((o) => o.year * 12 + o.month === oldest.get(`${o.txnId}:${o.lineItemId}`));
  kept.sort((a, b) => b.score - a.score || a.gap - b.gap || a.txnId.localeCompare(b.txnId));
  const usedBills = new Set<string>();
  const usedTxns = new Set<string>();
  const out: Suggestion[] = [];
  for (const o of kept) {
    const billKey = `${o.lineItemId}:${o.year}:${o.month}`;
    if (usedBills.has(billKey) || usedTxns.has(o.txnId)) continue;
    usedBills.add(billKey);
    usedTxns.add(o.txnId);
    out.push({ lineItemId: o.lineItemId, year: o.year, month: o.month, txnId: o.txnId, confidence: o.confidence, reason: o.reason });
  }
  return out;
}

// ---------------------------------------------------------------- already recorded by hand

export interface RecordedPayment {
  lineItemId: string;
  year: number;
  month: number;
  amountCents: number;
  /** YYYY-MM-DD, when given. */
  paidOn: string | null;
  /** YYYY-MM-DD the entry was made. */
  createdOn: string;
}

/**
 * Charges that a payment recorded by hand (before the feed, or without
 * linking) already accounts for, as `lineItemId:txnId` keys, so the charge
 * isn't offered again for another month of the same bill. Same amount (within
 * $1) and either a paid date within 10 days of the charge, or an entry made
 * after the charge posted for that month or the one before.
 */
export function coveredByRecorded(recorded: RecordedPayment[], txns: MatchTxn[]): Set<string> {
  const out = new Set<string>();
  for (const r of recorded) {
    for (const t of txns) {
      if (Math.abs(Math.abs(t.amountCents) - r.amountCents) > 100) continue;
      const posted = day(t.postedOn);
      const byDate = r.paidOn !== null && Math.abs(day(r.paidOn) - posted) <= 10;
      const tMonth = Number(t.postedOn.slice(0, 4)) * 12 + Number(t.postedOn.slice(5, 7));
      const entryMonth = r.year * 12 + r.month;
      const byEntry = day(r.createdOn) >= posted - 2 && (entryMonth === tMonth || entryMonth === tMonth - 1);
      if (byDate || byEntry) out.add(`${r.lineItemId}:${t.id}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- repeating charges

export interface RepeatTxn {
  postedOn: string;
  amountCents: number;
  merchant: string;
  merchantKey: string;
}

export interface Repeat {
  merchantKey: string;
  merchant: string;
  typicalCents: number;
  typicalDay: number;
  months: number;
  lastOn: string;
}

/**
 * Charges that come back every month at about the same amount and time: in at
 * least three different months, amounts within 20% of the middle one, days of
 * the month within a week of each other.
 */
export function findRepeats(txns: RepeatTxn[], minMonths = 3): Repeat[] {
  const groups = new Map<string, RepeatTxn[]>();
  for (const t of txns) {
    if (t.amountCents >= 0) continue;
    groups.set(t.merchantKey, [...(groups.get(t.merchantKey) ?? []), t]);
  }
  const out: Repeat[] = [];
  for (const [key, rows] of groups) {
    const byMonth = new Map<string, RepeatTxn>();
    for (const r of rows.sort((a, b) => a.postedOn.localeCompare(b.postedOn))) byMonth.set(r.postedOn.slice(0, 7), r);
    const monthly = [...byMonth.values()];
    if (monthly.length < minMonths) continue;
    const amounts = monthly.map((r) => -r.amountCents).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (amounts.some((a) => Math.abs(a - median) > median * 0.2)) continue;
    const days = monthly.map((r) => Number(r.postedOn.slice(8, 10))).sort((a, b) => a - b);
    if (days[days.length - 1] - days[0] > 7) continue;
    out.push({
      merchantKey: key,
      merchant: monthly[monthly.length - 1].merchant,
      typicalCents: median,
      typicalDay: days[Math.floor(days.length / 2)],
      months: monthly.length,
      lastOn: monthly[monthly.length - 1].postedOn,
    });
  }
  return out.sort((a, b) => b.typicalCents - a.typicalCents);
}
