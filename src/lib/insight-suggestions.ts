/**
 * Suggestions worked out from complete months of bank history: where spending
 * is rising, which flexible categories are worth trimming, charges that repeat
 * every month without being a bill, and what card interest and fees cost.
 *
 * Every figure is a monthly amount so the suggestions can be ranked by what
 * acting on them would keep. Pure: the server gathers the numbers.
 */

export interface CategorySeries {
  id: string;
  name: string;
  /** Everyday spending per complete month, oldest first. */
  monthly: number[];
}

export interface MerchantSeries {
  name: string;
  /** Spending per complete month, oldest first. */
  monthly: number[];
  /** Number of charges per month, oldest first. */
  charges: number[];
}

export interface PromoPlan {
  name: string;
  monthlyCents: number;
  paymentsLeft: number;
  /** YYYY-MM-DD. */
  endsOn: string;
}

export interface SuggestionInput {
  categories: CategorySeries[];
  merchants: MerchantSeries[];
  /** Card interest per complete month, oldest first. */
  interest: number[];
  /** Late, annual, overdraft and similar fees per complete month, oldest first. */
  fees: number[];
  promos: PromoPlan[];
}

export type SuggestionKind = "rising" | "trim" | "repeating" | "interest" | "fees" | "payoff";

export interface Suggestion {
  kind: SuggestionKind;
  title: string;
  detail: string;
  /** What acting on it would keep each month; 0 for information only. */
  monthlyCents: number;
  /** Items behind the suggestion (repeating charges), largest first. */
  items?: Array<{ name: string; cents: number }>;
  categoryId?: string;
}

/** Categories people can usually turn down without missing a bill. */
const FLEXIBLE = /^(dining|restaurants|eating out|dining out|shopping|household|general|entertainment|fun|recreation|travel|vacation|personal care|personal|subscriptions?|streaming|hobbies|coffee|alcohol)$/i;
/** Spending that repeats by nature and isn't a subscription. */
const NOT_SUBSCRIPTION = /^(groceries|grocery|food|fuel|gas|gasoline|dining|restaurants|eating out|dining out|cash|atm)$/i;

/** Groceries, fuel and the like repeat by nature; they aren't subscriptions. */
export function isSteadyEveryday(categoryName: string | null | undefined): boolean {
  return !!categoryName && NOT_SUBSCRIPTION.test(categoryName.trim());
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

/** Rounds a monthly saving to something that reads as an estimate. */
function roundish(cents: number): number {
  const step = cents >= 50_000 ? 2_500 : cents >= 10_000 ? 1_000 : 500;
  return Math.max(step, Math.round(cents / step) * step);
}

export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const out: Suggestion[] = [];
  const months = Math.max(input.interest.length, ...input.categories.map((c) => c.monthly.length), 0);
  if (months < 3) return out;

  // Rising: the last three months against the three before.
  const rising = new Set<string>();
  if (months >= 6) {
    for (const c of input.categories) {
      const recent = avg(c.monthly.slice(-3));
      const before = avg(c.monthly.slice(-6, -3));
      const delta = recent - before;
      if (delta >= Math.max(4_000, before * 0.2) && recent >= 7_500) {
        rising.add(c.id);
        out.push({
          kind: "rising",
          title: `${c.name} is up ${dollars(delta)} a month`,
          detail: `About ${dollars(recent)} a month over the last three months, up from ${dollars(before)}. Getting back to ${dollars(before)} would keep about ${dollars(delta * 12)} a year.`,
          monthlyCents: Math.round(delta),
          categoryId: c.id,
        });
      }
    }
  }

  // Trim: the two largest flexible categories that aren't already flagged as rising.
  const flexible = input.categories
    .filter((c) => FLEXIBLE.test(c.name.trim()) && !rising.has(c.id))
    .map((c) => ({ c, recent: avg(c.monthly.slice(-3)) }))
    .filter((x) => x.recent >= 10_000)
    .sort((a, b) => b.recent - a.recent)
    .slice(0, 2);
  for (const { c, recent } of flexible) {
    const keep = roundish(recent * 0.15);
    out.push({
      kind: "trim",
      title: `Trim ${c.name} by 15%`,
      detail: `${c.name} runs about ${dollars(recent)} a month. Spending 15% less would keep about ${dollars(keep)} a month, ${dollars(keep * 12)} a year.`,
      monthlyCents: keep,
      categoryId: c.id,
    });
  }

  // Repeating: a charge or two from the same merchant in each of the last three
  // months, at a steady amount. Bill payments never reach here.
  const repeating = input.merchants
    .filter((m) => {
      const last = m.monthly.slice(-3);
      const charges = m.charges.slice(-3);
      if (last.length < 3 || last.some((x) => x <= 0) || charges.some((n) => n < 1 || n > 2)) return false;
      const mean = avg(last);
      return mean >= 300 && mean <= 30_000 && Math.max(...last) - Math.min(...last) <= Math.max(200, mean * 0.15);
    })
    .map((m) => ({ name: m.name, cents: Math.round(avg(m.monthly.slice(-3))) }))
    .sort((a, b) => b.cents - a.cents);
  if (repeating.length) {
    const total = sum(repeating.map((r) => r.cents));
    out.push({
      kind: "repeating",
      title: `${repeating.length} charge${repeating.length === 1 ? "" : "s"} repeat every month: ${dollars(total)} a month`,
      detail: "Steady charges that aren't set up as bills, like subscriptions and memberships. Worth a look for any you no longer use, or add them as bills so they're planned for.",
      monthlyCents: 0,
      items: repeating.slice(0, 8),
    });
  }

  // Card interest and fees over the whole window.
  const interest = sum(input.interest);
  if (interest >= 100) {
    const recent = avg(input.interest.slice(-3));
    out.push({
      kind: "interest",
      title: `Card interest cost ${dollars(interest)} over ${months} months`,
      detail: recent > 0
        ? `About ${dollars(recent)} a month lately. Paying each card's statement in full by its due date stops new interest; a 0% card on a payoff plan charges none until its offer ends.`
        : "None in the last three months.",
      monthlyCents: Math.round(recent),
    });
  }
  const fees = sum(input.fees);
  if (fees >= 100) {
    out.push({
      kind: "fees",
      title: `Fees cost ${dollars(fees)} over ${months} months`,
      detail: "Late, annual, overdraft and similar fees. Autopay for at least the minimum payment avoids late fees.",
      monthlyCents: Math.round(fees / months),
    });
  }

  // 0% payoff plans: the monthly amount that clears each before its rate goes up.
  for (const p of input.promos) {
    out.push({
      kind: "payoff",
      title: `${p.name}: ${dollars(p.monthlyCents)} a month clears it`,
      detail: `${p.paymentsLeft} payment${p.paymentsLeft === 1 ? "" : "s"} left before the 0% offer ends ${longDate(p.endsOn)}. Anything kept from the suggestions above can go here to finish sooner.`,
      monthlyCents: 0,
    });
  }

  const order: SuggestionKind[] = ["rising", "interest", "fees", "trim", "repeating", "payoff"];
  return out.sort((a, b) => b.monthlyCents - a.monthlyCents || order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** True when a description reads like card interest rather than a fee. */
export function isInterestCharge(text: string): boolean {
  return /\b(interest charge|purchase interest|finance charge|interest on purchases|cash advance interest)\b/i.test(text);
}

/** True when a description reads like a bank or card fee. */
export function isFeeCharge(text: string): boolean {
  return /\b(late (fee|charge|payment fee)|annual (membership )?fee|overdraft|nsf fee|returned payment|foreign transaction fee|service (fee|charge)|cash advance fee)\b/i.test(text);
}
