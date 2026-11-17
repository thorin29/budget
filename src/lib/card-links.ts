/**
 * Which card a card-payment bill pays, and which month a payment to it counts
 * for. Pure: the server gathers the rows.
 *
 *  - From history: payments recorded for the bill by hand line up with
 *    payments that reached one card (same amount, within a few days).
 *  - From names: the bill's name shares a distinctive word with exactly one
 *    card's name. Loans, insurance and the like never match this way.
 */

import { tokens } from "./bill-match";
import { dueAfter, lastCloseDate } from "./card-payment";

export interface RecordedPayment {
  lineItemId: string;
  /** YYYY-MM-DD */
  paidOn: string;
  cents: number;
}

export interface CardCredit {
  cardId: string;
  /** YYYY-MM-DD */
  postedOn: string;
  cents: number;
}

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Bills whose recorded payments mostly match payments to one card. */
export function cardsFromHistory(payments: RecordedPayment[], credits: CardCredit[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const p of payments) {
    const hits = new Set(
      credits
        .filter((c) => Math.abs(c.cents - p.cents) <= 100 && Math.abs(at(c.postedOn) - at(p.paidOn)) <= 4 * DAY)
        .map((c) => c.cardId),
    );
    // A payment matching two cards says nothing.
    if (hits.size !== 1) continue;
    const [card] = hits;
    const v = votes.get(p.lineItemId) ?? new Map<string, number>();
    v.set(card, (v.get(card) ?? 0) + 1);
    votes.set(p.lineItemId, v);
  }
  const out = new Map<string, string>();
  for (const [item, v] of votes) {
    const ranked = [...v].sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((s, [, n]) => s + n, 0);
    if (ranked[0][1] * 3 >= total * 2) out.set(item, ranked[0][0]);
  }
  return out;
}

const GENERIC = new Set(["card", "cards", "visa", "mastercard", "amex", "discover", "credit", "platinum", "gold", "signature", "rewards", "preferred", "cash", "back", "one", "bank", "account", "checking", "savings", "world", "elite", "plus", "member", "mbr"]);
const NOT_A_CARD = /\b(mortgage|loan|insurance|rent|utilit|electric|water|phone|internet|tuition|hoa)\w*/i;

/** The one card whose name shares a distinctive word with the bill's, if exactly one does. */
export function cardByName(billName: string, cards: Array<{ id: string; names: string[] }>): string | null {
  if (NOT_A_CARD.test(billName)) return null;
  const words = [...tokens(billName)].filter((w) => !GENERIC.has(w));
  if (!words.length) return null;
  const hits = cards.filter((c) => {
    const cardWords = tokens(c.names.join(" "));
    return words.some((w) => cardWords.has(w) || cardWords.has(w.replace(/s$/, "")) || cardWords.has(`${w}s`));
  });
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * The month a card payment counts for. With the card's closing day, a payment
 * pays the statement that closed last (so one made after the closing day
 * counts toward the next due date); without it, the next due date from a few
 * days before the payment.
 */
export function paymentMonth(postedOn: string, dueDay: number, closeDay: number | null): { year: number; month: number } {
  const due = closeDay ? dueAfter(lastCloseDate(postedOn, closeDay), dueDay) : dueAfter(new Date(at(postedOn) - 6 * DAY).toISOString().slice(0, 10), dueDay);
  return { year: Number(due.slice(0, 4)), month: Number(due.slice(5, 7)) };
}
