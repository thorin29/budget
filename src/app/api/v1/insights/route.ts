import { requireDevice } from "@/server/device-auth";
import { getInsights, getSuggestions } from "@/server/insights";
import { getUpcoming } from "@/server/yearly";
import { payoffTrackers } from "@/server/card-payments";
import { getMonthView } from "@/server/month";
import { getAllowance } from "@/server/allowance";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * A month of Insights for the phone, as on the web: totals, pace and what's
 * left after bills, yearly charges coming up, 0% payoffs, suggestions,
 * categories (with the same month last year), what changed, top merchants,
 * twelve months of totals, and money managed for others.
 */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const p = new URL(request.url).searchParams;
    const now = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit" }).format(new Date());
    const [y, m] = (p.get("m") && /^\d{4}-\d{2}$/.test(p.get("m")!) ? p.get("m")! : now).split("-").map(Number);
    const atNow = `${y}-${String(m).padStart(2, "0")}` === now;
    const [i, suggestions, upcoming, payoff, view] = await Promise.all([
      getInsights(y, m),
      getSuggestions(),
      getUpcoming(),
      payoffTrackers(),
      atNow ? getMonthView(y, m).catch(() => null) : Promise.resolve(null),
    ]);
    const limit = atNow ? await getAllowance().catch(() => null) : null;
    return ok({
      year: i.year,
      month: i.month,
      everydayCents: i.current.everydayCents,
      everydayAverageCents: i.everydayAverageCents,
      billsCents: i.current.billsCents,
      inCents: i.current.inCents,
      netCents: i.current.netCents,
      categories: i.categories.slice(0, 12).map((c) => ({ id: c.id, name: c.name, cents: c.cents, averageCents: c.averageCents, lastYearCents: c.lastYearCents })),
      uncategorizedCount: i.uncategorized.count,
      pace: i.pace,
      /** The month in progress: the most everyday spending can be each month and keep within the plan. */
      limit,
      /** What the bills account has left after this month's bills and paychecks (Second half remaining). */
      leftAfterBillsCents: view?.transferAfterSecondCents ?? null,
      weekCents: i.weekCents,
      lastYear: i.lastYear,
      months: i.months.map((x) => ({ year: x.year, month: x.month, everydayCents: x.everydayCents, billsCents: x.billsCents, inCents: x.inCents, netCents: x.netCents })),
      changes: i.changes.map((c) => ({ id: c.id, name: c.name, cents: c.cents, averageCents: c.averageCents })),
      merchants: i.merchants,
      managed: i.managed.map((x) => ({ name: x.name, heldCents: x.heldCents, monthInCents: x.monthInCents, monthOutCents: x.monthOutCents })),
      payoff: payoff.map((x) => ({
        name: x.name, startCents: x.startCents, balanceCents: x.balanceCents, paidCents: x.paidCents, endsOn: x.endsOn,
        paymentsLeft: x.paymentsLeft, monthlyCents: x.monthlyCents, planMonthlyCents: x.planMonthlyCents, onTrack: x.onTrack,
      })),
      upcoming: upcoming.map((u) => ({ merchant: u.merchant, expectedOn: u.expectedOn, cents: u.cents, years: u.years })),
      suggestions: suggestions.map((x) => ({
        kind: x.kind,
        title: x.title,
        detail: x.detail,
        monthlyCents: x.monthlyCents,
        categoryId: x.categoryId ?? null,
        items: (x.items ?? []).map((it) => ({ name: it.name, cents: it.cents, fromCents: it.fromCents ?? null })),
        months: x.months ?? [],
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
