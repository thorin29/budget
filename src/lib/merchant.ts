/**
 * Turns a bank description into a merchant name that groups well.
 *
 * Bank descriptions carry noise that splits one merchant into many: card
 * processor prefixes, store numbers, order ids, city and state codes. These
 * rules are generic — they describe how descriptions are formatted, not any
 * particular merchant — so the same name comes out of every branch and every
 * order. A person's own rules (which merchant is which category) belong in
 * their database, never here.
 */

/** Prefixes added by card processors and point-of-sale systems. */
const PROCESSOR_PREFIX =
  /^(?:SQ ?\*|TST ?\*|SP ?\*|PP ?\*|PAYPAL ?\*|DD ?\*|IC ?\*|PY ?\*|BT ?\*|CKO ?\*|WWP ?\*|OBC ?\*|FRG ?[*.]|CHR ?\*|SPO ?\*|PAR ?\*|WP ?\*|TM ?\*|EB ?\*|DT ?\*|CS ?\*|TYL ?\*|RDL ?\*|WL ?\*|GOOGLE ?\*|APL ?\*|MSFT ?\*|POS (?:DEBIT|PURCHASE)\s*-?\s*|DEBIT CARD PURCHASE\s*-?\s*|PURCHASE AUTHORIZED ON \d\d\/\d\d\s*|ACH (?:DEBIT|CREDIT)\s*-?\s*)/;

const US_STATE =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

const SMALL_WORDS = new Set(["and", "of", "the", "for", "at", "a", "an", "to", "in", "on"]);

export function cleanMerchant(description: string, payee?: string | null): string {
  // A payee from the feed is usually already clean; prefer it when present.
  const source = (payee?.trim() || description || "").toUpperCase();
  // Padded columns: "NAME          CITY ST" → NAME, before the spacing is collapsed.
  let s = source.replace(new RegExp(`\\s{3,}[A-Z0-9 .'-]*\\b(?:${US_STATE})\\s*$`), "");
  s = s.replace(/\s+/g, " ").trim();

  for (let i = 0; i < 2; i += 1) s = s.replace(PROCESSOR_PREFIX, "").trim();

  // "NAME*ORDERID" or "NAME #1234 ..." → NAME
  s = s.replace(/\*[A-Z0-9]{5,}\b.*$/, "");
  s = s.replace(/\s*#\s*\d+.*$/, "");
  // Trailing phone numbers, long ids, card digits, dates.
  s = s.replace(/\s+\d{3}[-.]?\d{3}[-.]?\d{4}\b.*$/, "");
  s = s.replace(/\s+X{2,}\d+$/, "");
  s = s.replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?\b.*$/, "");
  s = s.replace(/\s*\b\d{4,}\b.*$/, "");
  // A trailing state code.
  s = s.replace(new RegExp(`\\s+(?:${US_STATE})$`), "");
  // Leftover store numbers and punctuation.
  s = s.replace(/\s+\d{2,3}$/, "");
  s = s.replace(/[\s\-,*.#]+$/, "").replace(/^[\s\-,*.#]+/, "");

  if (!s) s = source.trim();
  return titleCase(s).slice(0, 80);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      // Keep short all-letter acronyms readable: "Bp", "Ups" read worse than "BP", "UPS".
      if (/^[a-z]{1,3}$/.test(word) && !/[aeiou]/.test(word)) return word.toUpperCase();
      return word.replace(/(^|[-'/.&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
    })
    .join(" ")
    .replace(/'S\b/g, "'s");
}
