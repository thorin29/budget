/**
 * Learning from payments already on record, so bills take care of themselves:
 *
 *  - which bank charge each hand-recorded payment was (to tie the merchant to
 *    the bill without recording anything new);
 *  - when a bill really posts, so its due day can follow;
 *  - whether a charge matches a bill exactly enough to record on its own.
 */

import type { MatchTxn } from "./bill-match";

export interface RecordedEntry {
  actualId: string;
  lineItemId: string;
  year: number;
  month: number;
  income: boolean;
  amountCents: number;
  /** YYYY-MM-DD, when the person gave one. */
  paidOn: string | null;
  dueDay: number | null;
}

const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

function dueIso(year: number, month: number, dueDay: number | null): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(dueDay ?? 15, last)).padStart(2, "0")}`;
}

/**
 * Pairs hand-recorded payments with the bank charge that was them: the same
 * amount (within $1), the right direction, and a date that fits (within 5 days
 * of the paid date given, or near that month's due day). Only pairs where
 * neither side has another candidate are returned.
 */
export function pairRecorded(entries: RecordedEntry[], txns: MatchTxn[]): Array<{ actualId: string; lineItemId: string; txnId: string }> {
  const candidates = new Map<string, Set<string>>();
  const byTxn = new Map<string, Set<string>>();
  for (const e of entries) {
    if (e.amountCents <= 0) continue;
    for (const t of txns) {
      if (e.income ? t.amountCents <= 0 : t.amountCents >= 0) continue;
      if (Math.abs(Math.abs(t.amountCents) - e.amountCents) > 100) continue;
      const posted = day(t.postedOn);
      const fits = e.paidOn
        ? Math.abs(posted - day(e.paidOn)) <= 5
        : Math.abs(posted - day(dueIso(e.year, e.month, e.dueDay))) <= (e.dueDay ? 12 : 20);
      if (!fits) continue;
      candidates.set(e.actualId, new Set([...(candidates.get(e.actualId) ?? []), t.id]));
      byTxn.set(t.id, new Set([...(byTxn.get(t.id) ?? []), e.actualId]));
    }
  }
  const out: Array<{ actualId: string; lineItemId: string; txnId: string }> = [];
  for (const e of entries) {
    const mine = candidates.get(e.actualId);
    if (!mine || mine.size !== 1) continue;
    const [txnId] = [...mine];
    if (byTxn.get(txnId)?.size !== 1) continue;
    out.push({ actualId: e.actualId, lineItemId: e.lineItemId, txnId });
  }
  return out;
}

/**
 * The day of the month a bill actually posts, from the posting dates of its
 * recent linked payments: at least three, all within four days of the middle
 * one. Null when there isn't enough to go on or they scatter.
 */
export function learnedDueDay(postedOn: string[]): number | null {
  const recent = [...postedOn].sort().slice(-6);
  if (recent.length < 3) return null;
  const days = recent.map((d) => Number(d.slice(8, 10))).sort((a, b) => a - b);
  const median = days[Math.floor(days.length / 2)];
  if (days.some((d) => Math.abs(d - median) > 4)) return null;
  return median;
}

/** Whether the due day should move: a learned day at least three days from the current one. */
export function shouldMoveDueDay(current: number | null, learned: number | null): learned is number {
  if (learned === null) return false;
  return current === null || Math.abs(current - learned) >= 3;
}

/**
 * Exact enough to record without asking: the merchant is already tied to the
 * bill, and the amount is the planned one or last time's, within $1.
 */
export function exactMatch(input: { knownMerchant: boolean; amountCents: number; budgetedCents: number; lastPaidCents: number | null }): boolean {
  if (!input.knownMerchant) return false;
  const near = (x: number) => Math.abs(input.amountCents - x) <= 100;
  return near(input.budgetedCents) || (input.lastPaidCents !== null && near(input.lastPaidCents));
}
