import { requireDevice } from "@/server/device-auth";
import { getInsights, getSuggestions } from "@/server/insights";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** A month's spending summary for the phone: everyday spending against the average, the top categories, and suggestions. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const p = new URL(request.url).searchParams;
    const now = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit" }).format(new Date());
    const [y, m] = (p.get("m") && /^\d{4}-\d{2}$/.test(p.get("m")!) ? p.get("m")! : now).split("-").map(Number);
    const [i, suggestions] = await Promise.all([getInsights(y, m), getSuggestions()]);
    return ok({
      year: i.year,
      month: i.month,
      everydayCents: i.current.everydayCents,
      everydayAverageCents: i.everydayAverageCents,
      billsCents: i.current.billsCents,
      inCents: i.current.inCents,
      categories: i.categories.slice(0, 6).map((c) => ({ name: c.name, cents: c.cents, averageCents: c.averageCents })),
      uncategorizedCount: i.uncategorized.count,
      pace: i.pace,
      suggestions: suggestions.map((x) => ({
        kind: x.kind,
        title: x.title,
        detail: x.detail,
        monthlyCents: x.monthlyCents,
        items: (x.items ?? []).map((it) => ({ name: it.name, cents: it.cents, fromCents: it.fromCents ?? null })),
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
