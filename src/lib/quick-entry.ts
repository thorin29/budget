/**
 * The keyboard entry box: "electric 172.40" means record 172.40 against the
 * item called something like "electric".
 *
 * Pure functions, so the parsing and ranking are tested without a browser.
 */

import { parseCents, type Cents } from "./money";

export interface QuickQuery {
  /** The text that names the item, lower-cased and trimmed. */
  words: string;
  /** The trailing amount, if one was typed. */
  amountCents: Cents | null;
}

/**
 * Splits off a trailing amount. Accepts "$1,234.5", "1234", "12.30". A number
 * that is the whole query is an amount with no item named.
 */
export function parseQuickQuery(input: string): QuickQuery {
  const text = input.trim();
  const match = text.match(/^(.*?)(?:^|\s+)\$?(\d[\d,]*(?:\.\d{0,2})?|\.\d{1,2})$/);

  if (!match) return { words: text.toLowerCase(), amountCents: null };

  const raw = match[2].replace(/,/g, "");
  const value = Number(raw);
  if (!Number.isFinite(value)) return { words: text.toLowerCase(), amountCents: null };

  return {
    words: match[1].trim().toLowerCase(),
    amountCents: Math.round(value * 100),
  };
}

export interface Matchable {
  name: string;
}

/**
 * Ranks items against the typed words: whole-name prefix first, then a word
 * prefix, then anywhere in the name. Items that do not match are dropped.
 * Ties keep the order they were given in, which the caller sets (unpaid first,
 * then by due date).
 */
export function rankMatches<T extends Matchable>(items: T[], words: string): T[] {
  const q = words.trim().toLowerCase();
  if (!q) return items.slice();

  const scored: Array<{ item: T; score: number; index: number }> = [];

  items.forEach((item, index) => {
    const name = item.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 3;
    else if (name.split(/[\s\-&/]+/).some((w) => w.startsWith(q))) score = 2;
    else if (name.includes(q)) score = 1;
    else if (initials(name).startsWith(q.replace(/\s+/g, ""))) score = 0.5;
    if (score >= 0) scored.push({ item, score, index });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.item);
}

function initials(name: string): string {
  return name
    .split(/[\s\-&/]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
}

/** "$12.00 under", "exactly on budget", "$3.10 over". */
export function describeDifference(amountCents: Cents, budgetCents: Cents, format: (c: Cents) => string) {
  const diff = amountCents - budgetCents;
  if (diff === 0) return "exactly on budget";
  return diff < 0 ? `${format(-diff)} under budget` : `${format(diff)} over budget`;
}

/** A typed amount as cents, or null when it is empty, malformed or negative. */
export function tryParseCents(raw: string): Cents | null {
  try {
    const cents = parseCents(raw);
    return cents >= 0 ? cents : null;
  } catch {
    return null;
  }
}
