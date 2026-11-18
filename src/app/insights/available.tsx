/** Available to spend: one worst-case figure, how long it holds, and what spending all of it does. */

import { Card } from "@/components/ui";
import type { Available } from "@/lib/available";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function AvailableCard({ a, thisMonth, nextPayOn }: { a: Available; thisMonth: string; nextPayOn: string | null }) {
  const at = a.limit ? `${day(a.limit.date)}, at ${a.limit.name}` : `end of ${thisMonth}`;
  const fact = (label: string, value: string, tone = "") => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`tnum text-right font-semibold ${tone}`}>{value}</dd>
    </div>
  );
  return (
    <Card>
      <p className="text-sm text-muted">Available to spend</p>
      <p className={`tnum mt-1 text-4xl font-bold ${a.shortCents > 0 ? "text-danger" : "text-ok"}`}>{money(a.cents)}</p>
      <p className="mt-1 text-sm">
        Good through <b>{day(a.until)}</b>
        <span className="text-muted"> · worst case, budgets fully used</span>
      </p>
      <dl className="mt-3 divide-y divide-line border-t border-line text-sm">
        {a.shortCents > 0 ? (
          <>
            {fact("Short", money(a.shortCents), "text-danger")}
            {fact("Where", at, "text-danger")}
          </>
        ) : (
          <>
            {fact("Spend it all and the lowest point is", `$0 · ${at}`)}
            {fact(`Bills and card payments through ${day(a.until)}`, "All paid", "text-ok")}
            {fact(nextPayOn ? `Left before the ${day(nextPayOn)} paycheck` : `Left on ${day(a.until)}`, money(a.endCents - a.cents))}
          </>
        )}
      </dl>
      <p className="mt-2 text-xs text-muted">Counts checking, pay through {day(a.until)}, every bill, the debt payment, card balances and what&rsquo;s left of {thisMonth}&rsquo;s budgets. Unplanned costs have no budget and aren&rsquo;t counted.</p>
    </Card>
  );
}
