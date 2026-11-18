/** Available to spend: one figure, how long it holds, and what spending all of it does to each stretch. */

import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import type { Available } from "@/lib/available";
import type { Case, Stretch } from "./outlook";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function AvailableCard({ a, mode, toggle, stretches }: { a: Available; mode: Case; toggle: ReactNode; stretches: Stretch[] }) {
  const tight = a.limit ? stretches.find((s) => a.limit!.date >= s.from && a.limit!.date <= s.to) : null;
  const fact = (label: string, value: string, tone = "") => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`tnum text-right font-semibold ${tone}`}>{value}</dd>
    </div>
  );
  return (
    <Card>
      <p className="text-sm text-muted">Available to spend</p>
      <div className="mt-3">{toggle}</div>
      <p className={`tnum mt-3 text-4xl font-bold ${a.shortCents > 0 ? "text-danger" : "text-ok"}`}>{money(a.cents)}</p>
      <p className="mt-1 text-sm">
        Good through <b>{day(a.until)}</b>
      </p>
      <dl className="mt-3 divide-y divide-line border-t border-line text-sm">
        {a.shortCents > 0 ? (
          <>
            {fact("Short", money(a.shortCents), "text-danger")}
            {fact("When", tight ? `${day(tight.from)}–${day(tight.to)}, before ${tight.endsBefore}` : "End of this month", "text-danger")}
          </>
        ) : (
          <>
            {fact("Tightest stretch", tight ? `${day(tight.from)}–${day(tight.to)}` : "End of this month")}
            {stretches.map((s) => (
              <div key={s.from}>{fact(`Spend it all: left before ${s.endsBefore}`, money(s.endCents - a.cents))}</div>
            ))}
            {fact(`Bills through ${day(a.until)}`, "All paid", "text-ok")}
          </>
        )}
      </dl>
      <p className="mt-2 text-xs text-muted">{mode === "worst" ? "Available funds using current and budgeted expenses." : "Available funds using current expenses only."}</p>
    </Card>
  );
}
