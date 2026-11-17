/**
 * Learning from payments already on record, so bills take care of themselves:
 *
 *  - which bank charge each hand-recorded payment was (to tie the merchant to
 *    the bill without recording anything new);
 *  - when a bill really posts, so its due day can follow;
 *  - whether a charge matches a bill exactly enough to record on its own.
 */

import { tokens, type MatchTxn } from "./bill-match";

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
  /** The bill's name, so a charge that names it can match a different amount. */
  name?: string;
}

const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

function dueIso(year: number, month: number, dueDay: number | null): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(dueDay ?? 15, last)).padStart(2, "0")}`;
}

/**
 * Pairs hand-recorded payments with the bank charge that was them: the right
 * direction, a date that fits (within 5 days of the paid date given, or near
 * that month's due day), and either the same amount (within $1) or a charge
 * that shares a word with the bill's name at a similar amount (60–140%), since
 * bills like utilities vary. Only pairs where neither side has another
 * candidate are returned.
 */
export function pairRecorded(entries: RecordedEntry[], txns: MatchTxn[]): Array<{ actualId: string; lineItemId: string; txnId: string }> {
  const candidates = new Map<string, Set<string>>();
  const byTxn = new Map<string, Set<string>>();
  for (const e of entries) {
    if (e.amountCents <= 0) continue;
    for (const t of txns) {
      if (e.income ? t.amountCents <= 0 : t.amountCents >= 0) continue;
      const amount = Math.abs(t.amountCents);
      const exact = Math.abs(amount - e.amountCents) <= 100;
      const named =
        !exact && e.name !== undefined && amount >= e.amountCents * 0.6 && amount <= e.amountCents * 1.4 &&
        [...tokens(e.name)].some((w) => tokens(`${t.merchant} ${t.description}`).has(w));
      if (!exact && !named) continue;
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

const middle = (days: number[]) => [...days].sort((a, b) => a - b)[Math.floor(days.length / 2)];

/**
 * The day of the month a bill actually posts, from its recent linked
 * payments. Bills drift (weekends, billing cycles), so it takes the middle of
 * the last six when they sit within a week of each other, or the middle of the
 * last three when the older ones have moved. Null with fewer than three, or
 * when even the latest three scatter.
 */
export function learnedDueDay(postedOn: string[]): number | null {
  const recent = [...postedOn].sort().slice(-6);
  if (recent.length < 3) return null;
  const days = recent.map((d) => Number(d.slice(8, 10)));
  const all = middle(days);
  if (days.every((d) => Math.abs(d - all) <= 7)) return all;
  const latest = days.slice(-3);
  const last = middle(latest);
  return latest.every((d) => Math.abs(d - last) <= 4) ? last : null;
}

/** Whether the due day should move: a learned day at least three days from the current one. */
export function shouldMoveDueDay(current: number | null, learned: number | null): learned is number {
  if (learned === null) return false;
  return current === null || Math.abs(current - learned) >= 3;
}

/**
 * Sure enough to record without asking: the charge comes from a merchant
 * already tied to the bill (the amount only has to be in the usual range,
 * 60–140% of the plan, checked by the matcher, because bills like utilities
 * change every month), or it is the bill's amount to the cent, at least $100,
 * and not a payment app (which carries unrelated payments).
 */
export function knownMatch(input: { knownMerchant: boolean; amountCents?: number; budgetedCents?: number; peerPayment?: boolean }): boolean {
  if (input.knownMerchant) return true;
  const { amountCents, budgetedCents } = input;
  return !input.peerPayment && amountCents !== undefined && budgetedCents !== undefined && budgetedCents >= 10_000 && Math.abs(amountCents) === budgetedCents;
}
