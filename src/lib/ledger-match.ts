/**
 * Matching an account typed by hand to its bank feed account. Only clear
 * matches count: shared name words, the institution's initials, or the same
 * last digits, with a compatible type, and each side the other's single best.
 */

import type { AccountType } from "./account-type";

const GENERIC = new Set(["checking", "check", "savings", "saving", "account", "acct", "card", "credit", "debit", "bank", "the", "and", "share", "shares", "primary", "my", "personal"]);

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
}

/** How well a hand-typed account name fits a feed account; 0 means not at all. */
export function matchScore(account: { name: string; kind: string }, bank: { institution: string | null; name: string; type: AccountType }): number {
  const kindOk = account.kind === "CREDIT_CARD" ? bank.type === "CREDIT_CARD" : account.kind === "BANK" ? bank.type === "CHECKING" || bank.type === "SAVINGS" : false;
  if (!kindOk) return 0;
  const mine = words(account.name);
  if (mine.some((w) => w.startsWith("sav")) && bank.type === "CHECKING") return 0;
  if (mine.some((w) => w.startsWith("check")) && bank.type === "SAVINGS") return 0;
  const theirs = words(`${bank.institution ?? ""} ${bank.name}`);
  let score = 0;
  const distinctive = new Set(theirs.filter((w) => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w)));
  for (const w of new Set(mine)) if (w.length >= 3 && !GENERIC.has(w) && distinctive.has(w)) score += 2;
  const initials = words(bank.institution ?? "").map((w) => w[0]).join("");
  if (initials.length >= 3 && mine.includes(initials)) score += 2;
  const myDigits = account.name.match(/\d{3,4}(?!.*\d)/)?.[0];
  const theirDigits = bank.name.match(/\d{3,4}(?!.*\d)/)?.[0];
  if (myDigits && theirDigits && myDigits === theirDigits) score += 3;
  return score;
}

/** Pairs where each side is the other's single best match. */
export function clearMatches<A extends { id: string }, B extends { id: string }>(accounts: A[], banks: B[], score: (a: A, b: B) => number): Array<[A, B]> {
  const grid = accounts.map((a) => banks.map((b) => score(a, b)));
  const out: Array<[A, B]> = [];
  accounts.forEach((a, i) => {
    const row = grid[i];
    const best = Math.max(0, ...row);
    if (best === 0 || row.filter((s) => s === best).length !== 1) return;
    const j = row.indexOf(best);
    const column = grid.map((r) => r[j]);
    if (column.filter((s) => s === best).length !== 1 || Math.max(...column) !== best) return;
    out.push([a, banks[j]]);
  });
  return out;
}
