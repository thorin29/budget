/**
 * Reads a transaction CSV exported from a bank or card site, whatever its
 * layout. Columns are found by header name: a date, a description, and either
 * one signed amount, an amount with a credit/debit column, or separate debit
 * and credit columns. Money out comes back negative.
 */

export interface CsvTransaction {
  /** YYYY-MM-DD */
  postedOn: string;
  /** Cents; negative is money out. */
  amountCents: number;
  description: string;
}

export interface CsvResult {
  rows: CsvTransaction[];
  /** Rows that could not be read, with the reason, for the preview. */
  problems: string[];
  layout: string;
}

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

function find(headers: string[], ...names: string[]): number {
  const keys = headers.map(norm);
  for (const name of names) {
    const i = keys.indexOf(norm(name));
    if (i !== -1) return i;
  }
  return -1;
}

/** Cents from "$1,234.56", "(12.00)", "-12", "12.00-". Null when empty. */
export function parseCents(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new CsvError(`"${raw}" isn't an amount`);
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** YYYY-MM-DD from 2026-11-03, 11/03/2026, 11/3/26 or 11-03-2026 (US order). */
export function parseDate(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let y: number, mo: number, d: number;
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/.exec(s);
    if (!m) return null;
    [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseBankCsv(text: string, { flipSigns = false } = {}): CsvResult {
  const table = splitCsv(text);
  if (table.length < 2) throw new CsvError("The file has no rows");
  if (table.length > 20_001) throw new CsvError("The file has more than 20,000 rows");

  // Some exports put a title or account summary above the header row.
  const headerAt = table.findIndex((r) => find(r, "date", "transaction date", "posting date", "posted date", "trans date") !== -1);
  if (headerAt === -1) throw new CsvError("Couldn't find a date column");
  const headers = table[headerAt];

  // Transaction date beats posting date: it is when the money actually moved.
  const date = find(headers, "transaction date", "trans date", "date", "posting date", "posted date", "post date");
  const description = find(headers, "description", "payee", "merchant", "name", "memo", "details", "original description");
  const amount = find(headers, "amount", "transaction amount", "amount usd");
  const debit = find(headers, "debit", "withdrawal", "withdrawals", "money out", "debit amount");
  const credit = find(headers, "credit", "deposit", "deposits", "money in", "credit amount");
  const indicator = find(headers, "credit debit indicator", "debit credit", "transaction type", "type", "dr cr");

  if (description === -1) throw new CsvError("Couldn't find a description column");
  let layout: string;
  if (amount !== -1 && indicator !== -1 && /indicator|debitcredit|drcr/.test(norm(headers[indicator]))) layout = "amount with credit/debit column";
  else if (amount !== -1) layout = "signed amount";
  else if (debit !== -1 || credit !== -1) layout = "debit and credit columns";
  else throw new CsvError("Couldn't find an amount column");

  const rows: CsvTransaction[] = [];
  const problems: string[] = [];
  for (let i = headerAt + 1; i < table.length; i += 1) {
    const r = table[i];
    const line = i + 1;
    const postedOn = parseDate(r[date]);
    if (!postedOn) {
      if (r.length > 1) problems.push(`Row ${line}: no readable date`);
      continue;
    }
    try {
      let cents: number | null;
      if (layout === "amount with credit/debit column") {
        const value = Math.abs(parseCents(r[amount]) ?? 0);
        cents = /credit|cr|deposit/i.test(r[indicator] ?? "") ? value : -value;
      } else if (layout === "signed amount") {
        cents = parseCents(r[amount]);
      } else {
        const out = debit !== -1 ? parseCents(r[debit]) : null;
        const inn = credit !== -1 ? parseCents(r[credit]) : null;
        cents = (inn ? Math.abs(inn) : 0) - (out ? Math.abs(out) : 0);
        if (out === null && inn === null) cents = null;
      }
      if (cents === null) {
        problems.push(`Row ${line}: no amount`);
        continue;
      }
      const text = (r[description] ?? "").trim().replace(/\s+/g, " ");
      rows.push({ postedOn, amountCents: flipSigns ? -cents : cents, description: text.slice(0, 1000) || "(no description)" });
    } catch (error) {
      problems.push(`Row ${line}: ${error instanceof Error ? error.message : "unreadable"}`);
    }
  }
  if (!rows.length) throw new CsvError(problems[0] ?? "No transactions found");
  return { rows, problems: problems.slice(0, 20), layout };
}
