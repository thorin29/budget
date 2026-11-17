"use client";

import { useState, useTransition } from "react";
import { Button, ErrorBanner } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { addYearlyAction, dismissYearlyAction, type InsightState } from "./actions";

const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const yearOf = (iso: string) => iso.slice(0, 4);

export interface ComingUpItem {
  key: string;
  merchant: string;
  expectedOn: string;
  cents: number;
  lastOn: string;
  years: number;
}

/** One yearly charge expected soon, with a way to plan it or hide it. */
export function ComingUpRow({ item }: { item: ComingUpItem }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<InsightState | null>(null);
  if (result?.ok) return <li className="py-3 text-sm text-muted">{result.message}</li>;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold">{item.merchant}</span>
          <span className="block text-xs text-muted">
            Around {date(item.expectedOn)} ·{" "}
            {item.years >= 2 ? `charged around this date ${item.years} years running` : `charged ${date(item.lastOn)}, ${yearOf(item.lastOn)}`}
          </span>
        </span>
        <span className="tnum font-bold">{formatCents(item.cents)}</span>
      </div>
      {result && !result.ok ? (
        <div className="mt-2">
          <ErrorBanner message={result.message} />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => start(async () => setResult(await addYearlyAction(item.key)))}>
          Add as a yearly bill
        </Button>
        <Button type="button" variant="quiet" disabled={busy} onClick={() => start(async () => setResult(await dismissYearlyAction(item.key)))}>
          Not yearly
        </Button>
      </div>
    </li>
  );
}
