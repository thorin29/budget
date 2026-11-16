/**
 * Working out a pay calendar from paycheck deposits, so it fits whatever
 * employer and schedule the person has: weekly, every two weeks (with its
 * three-paycheck months), twice a month, or monthly.
 */

export interface DetectedPay {
  frequency: "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY";
  /** The latest payday, YYYY-MM-DD. */
  latest: string;
  /** SEMI_MONTHLY / MONTHLY: the usual days of the month. */
  daysOfMonth: number[];
  count: number;
}

const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const middle = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** From four or more paycheck dates; null when they don't follow a schedule. */
export function detectPay(dates: string[]): DetectedPay | null {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 4) return null;

  // Weekly or every two weeks: the deposits that have a partner one period
  // away. An off-cycle deposit (a bonus run) has none and is left out.
  for (const [period, frequency] of [[14, "BIWEEKLY"], [7, "WEEKLY"]] as const) {
    const onCycle = sorted.filter((d) => sorted.some((e) => e !== d && Math.abs(Math.abs(day(d) - day(e)) - period) <= 2));
    if (onCycle.length < 4 || onCycle.length < sorted.length * 0.7) continue;
    const gaps = onCycle.slice(1).map((d, i) => day(d) - day(onCycle[i]));
    const steady = gaps.filter((g) => Math.abs(g - period) <= 2 || Math.abs(g - 2 * period) <= 2).length >= gaps.length * 0.8;
    // Twice a month also has ~14-day gaps; it's told apart below by landing on the same two days.
    if (steady && !(period === 14 && sameTwoDays(onCycle))) {
      return { frequency, latest: onCycle[onCycle.length - 1], daysOfMonth: [], count: onCycle.length };
    }
  }

  const gaps = sorted.slice(1).map((d, i) => day(d) - day(sorted[i]));
  const gap = middle(gaps);
  const latest = sorted[sorted.length - 1];
  const doms = sorted.map((d) => Number(d.slice(8, 10)));
  if (gap >= 13 && gap <= 17) {
    const two = sameTwoDays(sorted);
    if (two) return { frequency: "SEMI_MONTHLY", latest, daysOfMonth: two, count: sorted.length };
  }
  if (gap >= 27 && gap <= 33) return { frequency: "MONTHLY", latest, daysOfMonth: [middle(doms)], count: sorted.length };
  return null;
}

/** The two days of the month the dates land on, when they always land on the same two (end of month counts as one). */
function sameTwoDays(dates: string[]): [number, number] | null {
  const vals = dates.map((d) => Number(d.slice(8, 10))).map((d) => (d >= 28 ? 31 : d)).sort((x, y) => x - y);
  const tight = (xs: number[]) => xs.length > 0 && Math.max(...xs) - Math.min(...xs) <= 3;
  for (let i = 1; i < vals.length; i += 1) {
    const [first, second] = [vals.slice(0, i), vals.slice(i)];
    if (tight(first) && tight(second)) return [middle(first), middle(second)];
  }
  return null;
}

/**
 * Whether a calendar's paydays line up with the deposits: nearly every deposit
 * (allowing the odd bonus run) within 3 days of a payday, and the latest
 * payday accounted for.
 */
export function calendarMatches(paydays: string[], deposits: string[], latest?: string): boolean {
  if (!deposits.length) return true;
  const near = (d: string) => paydays.some((p) => Math.abs(day(p) - day(d)) <= 3);
  const hits = deposits.filter(near).length;
  return hits >= Math.ceil(deposits.length * 0.85) && (!latest || near(latest));
}

/** A merchant reduced to its employer words, so one payroll under two descriptions groups together. */
export function employerKey(merchant: string): string {
  const words = merchant
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !["deposit", "payroll", "direct", "dep", "ach", "ppd", "pay", "transfer", "from", "credit", "online", "salary", "co", "inc", "llc"].includes(w));
  return [...new Set(words)].slice(0, 2).join(" ");
}

/**
 * Income items set up the way a spreadsheet does it, "Pay", "Pay 2", "Pay 3",
 * mean the 1st, 2nd and 3rd paycheck of the month. Returns the payday number
 * for each item in such a family; items outside one are left out.
 */
export function paydayNumbersFromNames(items: Array<{ id: string; name: string }>): Map<string, number> {
  const families = new Map<string, Array<{ id: string; n: number }>>();
  for (const item of items) {
    const m = /^(.*?)\s+#?([2-5])$/.exec(item.name.trim());
    const base = (m ? m[1] : item.name).trim().toLowerCase();
    families.set(base, [...(families.get(base) ?? []), { id: item.id, n: m ? Number(m[2]) : 1 }]);
  }
  const out = new Map<string, number>();
  for (const members of families.values()) {
    const numbers = new Set(members.map((x) => x.n));
    // A real family: the plain name plus at least "2", each number once.
    if (members.length < 2 || numbers.size !== members.length || !numbers.has(1) || !numbers.has(2)) continue;
    for (const x of members) out.set(x.id, x.n);
  }
  return out;
}
