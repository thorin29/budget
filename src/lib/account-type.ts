/**
 * Guesses an account's type from the name its institution gives it. The rules
 * describe how institutions word account names, not any one institution, and
 * run in order: a "Thrift Savings Plan" is retirement before it is savings, a
 * "Vehicle Loan" is a loan before anything else.
 */

export const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "LOAN",
  "MORTGAGE",
  "INVESTMENT",
  "RETIREMENT",
  "CRYPTO",
  "OTHER",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan",
  MORTGAGE: "Mortgage",
  INVESTMENT: "Investment",
  RETIREMENT: "Retirement",
  CRYPTO: "Crypto",
  OTHER: "Other",
};

/** Checking and cards are where spending happens. */
export const SPENDING_TYPES: readonly AccountType[] = ["CHECKING", "CREDIT_CARD"];

export const GROUPS: Array<{ name: string; types: AccountType[] }> = [
  { name: "Cash", types: ["CHECKING", "SAVINGS"] },
  { name: "Cards", types: ["CREDIT_CARD"] },
  { name: "Loans", types: ["LOAN", "MORTGAGE"] },
  { name: "Investing & retirement", types: ["RETIREMENT", "INVESTMENT", "CRYPTO"] },
  { name: "Other", types: ["OTHER"] },
];

// Word edges that also work around "401(k)", whose last character isn't a letter.
const w = (body: string) => new RegExp(`(?:^|[^a-z0-9])(?:${body})(?![a-z0-9])`, "i");

const RULES: Array<[AccountType, RegExp]> = [
  ["RETIREMENT", w("401\\s*\\(?k\\)?|403\\s*\\(?b\\)?|457\\s*\\(?b\\)?|ira|roth|sep ira|simple ira|retirement|thrift savings|tsp|pension|annuity")],
  ["MORTGAGE", w("mortgage|home loan|heloc|home equity")],
  ["LOAN", w("loan|auto loan|vehicle|student|installment")],
  ["CRYPTO", w("wallet|staked|staking|crypto|bitcoin|btc|eth|vault")],
  ["CREDIT_CARD", w("credit card|card|visa|master ?card|amex|american express|discover|signature|rewards|platinum|cash back")],
  ["CHECKING", w("checking|chk|spending|everyday|share draft|dda")],
  ["SAVINGS", w("savings?|money market|mmsa?|mma|cd|certificate|shares?|reserve")],
  ["INVESTMENT", w("brokerage|joint tenant|jtwros|individual|investment|invest|portfolio|stocks?|managed|hsa|trust|custodial|utma|ugma|529")],
];

/** An unmatched name with money owed is almost always a card named only by its product. */
export function guessAccountType(name: string, balanceCents: number | null): AccountType {
  for (const [type, rule] of RULES) if (rule.test(name)) return type;
  return balanceCents !== null && balanceCents < 0 ? "CREDIT_CARD" : "OTHER";
}

/**
 * A crypto exchange lists a "Cash (USD)" balance beside its wallets. When most
 * of an institution's accounts are crypto, an unmatched one is crypto too.
 */
export function guessWithSiblings<T extends { institution: string | null; name: string; balanceCents: number | null }>(
  accounts: T[],
): AccountType[] {
  const first = accounts.map((a) => guessAccountType(a.name, a.balanceCents));
  const byInstitution = new Map<string, AccountType[]>();
  accounts.forEach((a, i) => {
    const k = a.institution ?? "";
    byInstitution.set(k, [...(byInstitution.get(k) ?? []), first[i]]);
  });
  return accounts.map((a, i) => {
    if (first[i] !== "OTHER") return first[i];
    const siblings = byInstitution.get(a.institution ?? "") ?? [];
    const crypto = siblings.filter((t) => t === "CRYPTO").length;
    return crypto > siblings.length / 2 ? "CRYPTO" : "OTHER";
  });
}

/** Folded away: no money in it and nothing happening. */
export function isDormant(balanceCents: number | null, latestOn: Date | null, now = new Date(), days = 60): boolean {
  const empty = balanceCents === null || Math.abs(balanceCents) < 1;
  const quiet = !latestOn || now.getTime() - latestOn.getTime() > days * 86_400_000;
  return empty && quiet;
}

const UUID_SUFFIX = /\s*\((?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\s*$/i;

/** Feed names often repeat the last digits or carry an internal id: "Checking - 1234 (1234)", "BTC Wallet (uuid)". */
export function displayAccountName(name: string): string {
  let s = name.replace(UUID_SUFFIX, "").trim();
  const tail = /\s*\(([^()]+)\)\s*$/.exec(s);
  if (tail && s.slice(0, tail.index).includes(tail[1])) s = s.slice(0, tail.index).trim();
  return s.replace(/\s{2,}/g, " ") || name;
}

