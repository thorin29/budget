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
  /** Merchant keys already tied to the bill. */
  knownKeys?: string[];
}

const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

function dueIso(year: number, month: number, dueDay: number | null): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(dueDay ?? 15, last)).padStart(2, "0")}`;
}

/**
 * Pairs hand-recorded payments with the bank charge that was them, across all history.
 *
 * A charge is a candidate when it goes the right way, its date fits, and either it names the bill
 * (shares a word with the bill's name, or comes from a merchant already tied to the bill) at a
 * similar amount (60–140%, since bills like utilities vary), or it is the same amount within $1.
 * A same-amount-only match needs at least $100 or an amount with cents, because round small
 * amounts ($35.00) turn up at any store. Dates fit within 5 days of the paid date given;
 * otherwise near that month's due day (12 days, 20 with no due day, 25 for a charge that names
 * the bill).
 *
 * Charges that name the bill beat ones that only share the amount. Then pairs are made one to one,
 * closest first, only when the choice is clear: the entry's only candidate left, or its only one in
 * the entry's own month, and likewise from the charge's side. That settles a monthly chain (a
 * deposit at the end of one month and another at the end of the next) without guessing.
 */
export function pairRecorded(entries: RecordedEntry[], txns: MatchTxn[]): Array<{ actualId: string; lineItemId: string; txnId: string }> {
  type Cand = { e: RecordedEntry; t: MatchTxn; named: boolean; dist: number; sameMonth: boolean };
  const byEntry = new Map<string, Cand[]>();
  const words = new Map(txns.map((t) => [t.id, tokens(`${t.merchant} ${t.description}`)]));
  for (const e of entries) {
    if (e.amountCents <= 0) continue;
    const nameWords = e.name !== undefined ? [...tokens(e.name)] : [];
    const known = new Set(e.knownKeys ?? []);
    const ym = `${e.year}-${String(e.month).padStart(2, "0")}`;
    const list: Cand[] = [];
    for (const t of txns) {
      if (e.income ? t.amountCents <= 0 : t.amountCents >= 0) continue;
      const amount = Math.abs(t.amountCents);
      const exact = Math.abs(amount - e.amountCents) <= 100;
      const similar = amount >= e.amountCents * 0.6 && amount <= e.amountCents * 1.4;
      const named = similar && ((t.merchantKey !== "" && known.has(t.merchantKey)) || (nameWords.length > 0 && nameWords.some((w) => words.get(t.id)!.has(w))));
      const amountOnly = exact && (e.amountCents >= 10_000 || e.amountCents % 100 !== 0);
      if (!named && !amountOnly) continue;
      const posted = day(t.postedOn);
      const dist = e.paidOn ? Math.abs(posted - day(e.paidOn)) : Math.abs(posted - day(dueIso(e.year, e.month, e.dueDay)));
      const limit = e.paidOn ? 5 : named ? 25 : e.dueDay ? 12 : 20;
      if (dist > limit) continue;
      list.push({ e, t, named, dist, sameMonth: t.postedOn.slice(0, 7) === ym });
    }
    // A charge that names the bill outranks one that only shares the amount.
    const best = list.some((c) => c.named) ? list.filter((c) => c.named) : list;
    if (best.length) byEntry.set(e.actualId, best);
  }
  const byTxn = new Map<string, Cand[]>();
  for (const list of byEntry.values()) for (const c of list) byTxn.set(c.t.id, [...(byTxn.get(c.t.id) ?? []), c]);

  const usedEntry = new Set<string>();
  const usedTxn = new Set<string>();
  const out: Array<{ actualId: string; lineItemId: string; txnId: string }> = [];
  /** The one clear choice in a list, or null: the only one left, or the only one in its own month. */
  const clear = (list: Cand[], free: (c: Cand) => boolean): Cand | null => {
    const left = list.filter(free);
    if (left.length === 1) return left[0];
    const inMonth = left.filter((c) => c.sameMonth);
    return inMonth.length === 1 ? inMonth[0] : null;
  };
  for (let changed = true; changed; ) {
    changed = false;
    const ordered = [...byEntry.values()].flat().sort((a, b) => Number(b.named) - Number(a.named) || Number(b.sameMonth) - Number(a.sameMonth) || a.dist - b.dist);
    for (const c of ordered) {
      if (usedEntry.has(c.e.actualId) || usedTxn.has(c.t.id)) continue;
      const fromEntry = clear(byEntry.get(c.e.actualId)!, (x) => !usedTxn.has(x.t.id));
      if (fromEntry !== c) continue;
      const fromTxn = clear(byTxn.get(c.t.id)!, (x) => !usedEntry.has(x.e.actualId));
      if (fromTxn !== c) continue;
      usedEntry.add(c.e.actualId);
      usedTxn.add(c.t.id);
      out.push({ actualId: c.e.actualId, lineItemId: c.e.lineItemId, txnId: c.t.id });
      changed = true;
    }
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
