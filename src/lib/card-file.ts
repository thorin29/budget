/**
 * A card issuer's transaction download (CSV) that says which card on the account made each
 * charge, matched to the charges the bank feed already brought in. The feed only names the
 * account, so this is how charges made by someone else's card on your account (a family member
 * who pays you back) are told apart. Pure: the server loads the charges and writes categories.
 *
 * Columns read (case and order don't matter): a transaction date, a posted date, the card number
 * (its last 4), and the amount as one signed column or as Debit and Credit. Descriptions and every
 * other column are ignored.
 */

import { splitCsv } from "./bank-csv";

export interface CardFileRow {
  /** YYYY-MM-DD */
  transactionDate: string | null;
  postedDate: string | null;
  last4: string;
  /** Negative is a charge, positive a refund, as in the bank feed. */
  cents: number;
}

export interface FeedCharge {
  id: string;
  /** YYYY-MM-DD */
  postedOn: string;
  cents: number;
}

const DAY = 86_400_000;

function day(raw: string | undefined): string | null {
  const t = (raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function cents(raw: string | undefined): number | null {
  const t = (raw ?? "").replace(/[$,\s]/g, "");
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[()-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) * (neg ? -1 : 1) : null;
}

/** Reads the download. Throws with a plain message when the columns aren't there. */
export function parseCardFile(csv: string): CardFileRow[] {
  const rows = splitCsv(csv.replace(/^﻿/, ""));
  if (rows.length < 2) throw new Error("The file has no transactions");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: RegExp[]) => head.findIndex((h) => names.some((n) => n.test(h)));
  const iCard = col(/^card ?(no|number|#)/, /^card$/, /last ?4/);
  const iTrans = col(/^transaction date/, /^trans\.? date/, /^date$/);
  const iPosted = col(/^post(ed|ing)? date/);
  const iDebit = col(/^debit/);
  const iCredit = col(/^credit/);
  const iAmount = col(/^amount/);
  if (iCard < 0) throw new Error("This file has no card number column");
  if (iTrans < 0 && iPosted < 0) throw new Error("This file has no date column");
  if (iAmount < 0 && iDebit < 0 && iCredit < 0) throw new Error("This file has no amount column");
  const out: CardFileRow[] = [];
  for (const r of rows.slice(1)) {
    const last4 = /(\d{4})\D*$/.exec(r[iCard] ?? "")?.[1];
    if (!last4) continue;
    let c: number | null;
    if (iAmount >= 0) c = cents(r[iAmount]);
    else {
      const d = cents(r[iDebit]);
      const cr = cents(r[iCredit]);
      c = d ? -Math.abs(d) : cr ? Math.abs(cr) : null;
    }
    if (!c) continue;
    const transactionDate = iTrans >= 0 ? day(r[iTrans]) : null;
    const postedDate = iPosted >= 0 ? day(r[iPosted]) : null;
    if (!transactionDate && !postedDate) continue;
    out.push({ transactionDate, postedDate, last4, cents: c });
  }
  return out;
}

const gap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/**
 * Pairs each row with a feed charge of the same amount within [days] days, each charge used once,
 * closest date first. Every row is paired (not just other people's), so two same-amount charges on
 * one day aren't both claimed by one card. Returns charge id → the row's last 4.
 */
export function matchCardFile(rows: CardFileRow[], charges: FeedCharge[], days = 4): Map<string, string> {
  const pairs: Array<{ row: number; charge: number; gap: number }> = [];
  rows.forEach((r, i) => {
    charges.forEach((c, j) => {
      if (c.cents !== r.cents) return;
      const g = Math.min(...[r.postedDate, r.transactionDate].filter((d): d is string => !!d).map((d) => gap(d, c.postedOn)));
      if (g <= days) pairs.push({ row: i, charge: j, gap: g });
    });
  });
  pairs.sort((a, b) => a.gap - b.gap);
  const usedRow = new Set<number>();
  const usedCharge = new Set<number>();
  const out = new Map<string, string>();
  for (const p of pairs) {
    if (usedRow.has(p.row) || usedCharge.has(p.charge)) continue;
    usedRow.add(p.row);
    usedCharge.add(p.charge);
    out.set(charges[p.charge].id, rows[p.row].last4);
  }
  return out;
}
