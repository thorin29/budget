/**
 * Suggestions worked out from complete months of bank history: where spending
 * is rising, which flexible categories are worth trimming, charges that repeat
 * every month without being a bill (small ones too: those add up), new monthly
 * charges and prices that went up, and what card interest and fees cost.
 *
 * Every figure is a monthly amount so the suggestions can be ranked by what
 * acting on them would keep. Pure: the server gathers the numbers.
 */

export interface CategorySeries {
  id: string;
  name: string;
  /** Everyday spending per complete month, oldest first. */
  monthly: number[];
  /** The largest single charge in each month, oldest first. */
  top?: Array<{ merchant: string; cents: number } | null>;
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
  /** Short month names for the complete months, oldest first ("Jun"…"Nov"). */
  labels?: string[];
  /** Index of the first complete month the bank history covers; earlier months count as unknown, not $0. */
  firstMonth?: number;
}

export type SuggestionKind = "rising" | "spike" | "trim" | "repeating" | "new-repeat" | "price-up" | "interest" | "fees" | "payoff";

export interface Suggestion {
  kind: SuggestionKind;
  title: string;
  detail: string;
  /** What acting on it would keep each month; 0 for information only. */
  monthlyCents: number;
  /** Items behind the suggestion (repeating charges), largest first. */
  items?: Array<{ name: string; cents: number; /** The amount before, for a price that went up. */ fromCents?: number }>;
  categoryId?: string;
  /** What was actually spent each complete month, oldest first, for a category suggestion. */
  months?: Array<{ label: string; cents: number }>;
}

/** Categories people can usually turn down without missing a bill. */
const FLEXIBLE = /^(target & walmart|dining|restaurants|eating out|dining out|shopping|household|general|entertainment|fun|recreation|travel|vacation|personal care|personal|subscriptions?|streaming|hobbies|coffee|alcohol)$/i;
/** Spending that repeats by nature and isn't a subscription. */
const NOT_SUBSCRIPTION = /^(groceries|grocery|food|target & walmart|costco & sam's club|fuel|gas|gasoline|dining|restaurants|eating out|dining out|cash|atm)$/i;

/** Groceries, fuel and the like repeat by nature; they aren't subscriptions. */
export function isSteadyEveryday(categoryName: string | null | undefined): boolean {
  return !!categoryName && NOT_SUBSCRIPTION.test(categoryName.trim());
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const labels = input.labels ?? [];
  const label = (i: number, length: number) => labels[labels.length - length + i] ?? `month ${i + 1}`;
  // Months before the history starts are unknown, not $0, so they're left out.
  const series = (c: CategorySeries) =>
    c.monthly.map((cents, i) => ({ label: label(i, c.monthly.length), cents })).slice(Math.max(0, (input.firstMonth ?? 0) - (months - c.monthly.length)));
  const list = (xs: Array<{ label: string; cents: number }>) =>
    xs.length <= 1 ? xs.map((x) => `${dollars(x.cents)} in ${x.label}`).join("") : `${xs.slice(0, -1).map((x) => `${dollars(x.cents)} in ${x.label}`).join(", ")} and ${dollars(xs[xs.length - 1].cents)} in ${xs[xs.length - 1].label}`;

  // Rising: the last three months against the three before, and not just one
  // big month (that's a spike, below).
  const rising = new Set<string>();
  if (months >= 6) {
    const known = (xs: number[]) => xs.slice(Math.max(0, (input.firstMonth ?? 0) - (months - xs.length)));
  for (const c of input.categories) {
      const last3 = c.monthly.slice(-3);
      const recent = avg(last3);
      const beforeMonths = known(c.monthly).slice(0, -3).slice(-3);
      if (beforeMonths.length < 2) continue;
      const before = avg(beforeMonths);
      const delta = recent - before;
      const high = last3.filter((x) => x >= Math.max(before * 1.2, before + 2_000)).length;
      const recentMonths = series(c).slice(-3);
      if (delta >= Math.max(4_000, before * 0.2) && recent >= 7_500 && high >= 2) {
        rising.add(c.id);
        out.push({
          kind: "rising",
          title: `${c.name}: about ${dollars(recent)} a month lately, up from ${dollars(before)}`,
          detail: `Spent ${list(recentMonths)}, against about ${dollars(before)} a month before that. Getting back there would keep about ${dollars(delta * 12)} a year.`,
          monthlyCents: Math.round(delta),
          categoryId: c.id,
          months: series(c),
        });
        continue;
      }
      // Spike: one month far above the rest.
      const others = [...beforeMonths, ...last3];
      const peakIndex = last3.indexOf(Math.max(...last3));
      const peak = last3[peakIndex];
      const typical = avg(others.filter((_, i) => i !== others.length - 3 + peakIndex));
      if (peak >= 15_000 && peak >= Math.max(typical * 2.5, typical + 15_000)) {
        const at = recentMonths[peakIndex];
        const top = c.top?.[c.monthly.length - 3 + peakIndex];
        rising.add(c.id);
        out.push({
          kind: "spike",
          title: `${c.name}: ${dollars(peak)} in ${at.label}`,
          detail: `One big month; the others ran about ${dollars(typical)} a month.${top ? ` The largest charge was ${top.merchant} for ${money(top.cents)}.` : ""}`,
          monthlyCents: 0,
          categoryId: c.id,
          months: series(c),
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
      detail: `${c.name} ran ${list(series(c).slice(-3))}, about ${dollars(recent)} a month. Spending 15% less would keep about ${dollars(keep)} a month, ${dollars(keep * 12)} a year.`,
      monthlyCents: keep,
      categoryId: c.id,
      months: series(c),
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
      return mean >= 100 && mean <= 30_000 && Math.max(...last) - Math.min(...last) <= Math.max(200, mean * 0.15);
    })
    .map((m) => ({ name: m.name, cents: Math.round(avg(m.monthly.slice(-3))) }))
    .sort((a, b) => b.cents - a.cents);
  if (repeating.length) {
    const total = sum(repeating.map((r) => r.cents));
    out.push({
      kind: "repeating",
      title: `${repeating.length} charge${repeating.length === 1 ? " repeats" : "s repeat"} every month: ${money(total)} a month`,
      detail: "Steady charges that aren't set up as bills, like subscriptions and memberships. Worth a look for any you no longer use, or add them as bills so they're planned for.",
      monthlyCents: 0,
      items: repeating.slice(0, 12),
    });
  }

  // Worth keeping an eye on: monthly charges that only just started, and steady
  // ones whose latest charge went up.
  const steadyMonths = (xs: number[], ns: number[]) => {
    if (!xs.length || xs.some((x) => x <= 0) || ns.some((n) => n < 1 || n > 2)) return false;
    const mean = avg(xs);
    return mean >= 100 && Math.max(...xs) - Math.min(...xs) <= Math.max(100, mean * 0.15);
  };
  if (months >= 4) {
    const started = input.merchants
      .filter((m) => steadyMonths(m.monthly.slice(-2), m.charges.slice(-2)) && m.monthly.slice(0, -2).every((x) => x === 0) && avg(m.monthly.slice(-2)) <= 30_000)
      .map((m) => ({ name: m.name, cents: Math.round(avg(m.monthly.slice(-2))) }))
      .sort((a, b) => b.cents - a.cents);
    if (started.length) {
      out.push({
        kind: "new-repeat",
        title: started.length === 1
          ? `New monthly charge: ${started[0].name}, ${money(started[0].cents)}`
          : `${started.length} new monthly charges: ${dollars(sum(started.map((x) => x.cents)))} a month`,
        detail: "Charged the last two months and not before, like a trial that turned into a subscription.",
        monthlyCents: 0,
        items: started.slice(0, 8),
      });
    }
    const raised = input.merchants
      .filter((m) => steadyMonths(m.monthly.slice(-4, -1), m.charges.slice(-4, -1)) && m.charges[m.charges.length - 1] === 1)
      .map((m) => ({ name: m.name, cents: m.monthly[m.monthly.length - 1], fromCents: Math.round(avg(m.monthly.slice(-4, -1))) }))
      .filter((x) => x.cents - x.fromCents >= Math.max(50, x.fromCents * 0.05) && x.cents <= x.fromCents * 2)
      .sort((a, b) => b.cents - b.fromCents - (a.cents - a.fromCents));
    if (raised.length) {
      const up = sum(raised.map((x) => x.cents - x.fromCents));
      out.push({
        kind: "price-up",
        title: raised.length === 1
          ? `${raised[0].name} went up to ${money(raised[0].cents)}`
          : `${raised.length} monthly charges went up: ${money(up)} a month more`,
        detail: raised.length === 1
          ? `It was ${money(raised[0].fromCents)} a month before last month.`
          : "Each was steady for months before last month's charge came in higher.",
        monthlyCents: 0,
        items: raised.slice(0, 8),
      });
    }
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

  const order: SuggestionKind[] = ["rising", "spike", "interest", "fees", "trim", "price-up", "new-repeat", "repeating", "payoff"];
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
