/**
 * Charges that come once a year (memberships, renewals, registrations), found
 * in bank history so they can be expected before they land. A merchant counts
 * when it charged around the same date in two years running, with nothing in
 * between; one charge a year ago counts only when it reads like a renewal.
 * Pure: the server gathers the charges.
 */

export interface PastCharge {
  /** Groups charges from one merchant (its merchant key). */
  key: string;
  merchant: string;
  description: string;
  /** YYYY-MM-DD */
  postedOn: string;
  /** Money out, positive. */
  cents: number;
  categoryName?: string | null;
}

export interface UpcomingCharge {
  key: string;
  merchant: string;
  /** About a year after the last charge. YYYY-MM-DD */
  expectedOn: string;
  /** The last charge's amount. */
  cents: number;
  lastOn: string;
  /** Years in a row it was charged around this date. */
  years: number;
}

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** The same date a year on (Feb 29 becomes Feb 28). */
export function aYearOn(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

const RENEWAL = /\b(annual|yearly|renewal|renew|membership|member fee|registration|subscription|prime|license|licence|dues)\b/i;
const NEAR = 20 * DAY;

export function upcomingYearly(charges: PastCharge[], today: string, horizonDays = 45): UpcomingCharge[] {
  const now = at(today);
  const byKey = new Map<string, PastCharge[]>();
  for (const c of charges) {
    if (c.cents < 2_000 || !c.key) continue;
    byKey.set(c.key, [...(byKey.get(c.key) ?? []), c]);
  }
  const out: UpcomingCharge[] = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.postedOn.localeCompare(b.postedOn));
    const last = list[list.length - 1];
    const expected = at(aYearOn(last.postedOn));
    // Due within the horizon, or a few days late without having come yet.
    if (expected < now - 5 * DAY || expected > now + horizonDays * DAY) continue;
    // Anything from it in the year since rules out a yearly charge.
    if (list.some((c) => c !== last && at(c.postedOn) > at(last.postedOn) - 300 * DAY && at(c.postedOn) < at(last.postedOn) - 3 * DAY)) continue;
    // Years in a row around the same date.
    let years = 1;
    let anchor = at(last.postedOn);
    for (;;) {
      const target = anchor - 365 * DAY;
      const prior = list.find((c) => Math.abs(at(c.postedOn) - target) <= NEAR);
      if (!prior) break;
      years += 1;
      anchor = at(prior.postedOn);
    }
    const renewal = RENEWAL.test(`${last.merchant} ${last.description}`) || /^subscriptions?$/i.test(last.categoryName?.trim() ?? "");
    if (years < 2 && !renewal) continue;
    out.push({ key, merchant: last.merchant, expectedOn: iso(expected), cents: last.cents, lastOn: last.postedOn, years });
  }
  return out.sort((a, b) => a.expectedOn.localeCompare(b.expectedOn) || b.cents - a.cents);
}
