"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ErrorBanner } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { merchantPaysBillAction, sortMerchantAction, type InsightState } from "../actions";

const whole = (cents: number) => formatCents(Math.round(cents / 100) * 100).replace(/\.00$/, "");
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export interface SortRow {
  key: string;
  merchant: string;
  count: number;
  cents: number;
  lastOn: string;
  accounts: string[];
  peer: boolean;
  examples: string[];
}

/** One merchant: pick a category, or the bill it pays. */
export function SorterRow({
  row,
  categories,
  bills,
  billOnly = false,
}: {
  row: SortRow;
  categories: Array<{ id: string; name: string }>;
  bills: Array<{ id: string; name: string }>;
  /** Already categorized: only the "pays a bill" choice. */
  billOnly?: boolean;
}) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<InsightState | null>(null);
  if (result?.ok) return <li className="py-3 text-sm text-muted">{result.message}</li>;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <span className="min-w-0 flex-1 basis-56">
        <span className="block truncate font-semibold">{row.merchant}</span>
        <span className="block truncate text-xs text-muted">
          {row.count} charge{row.count === 1 ? "" : "s"} · last {short(row.lastOn)} · {row.accounts.join(", ")}
          {billOnly && row.examples[0] ? ` · now in ${row.examples[0]}` : row.examples[0] && row.examples[0].toLowerCase() !== row.merchant.toLowerCase() ? ` · “${row.examples[0]}”` : ""}
        </span>
      </span>
      <span className="tnum w-24 shrink-0 text-right font-bold">{whole(row.cents)}</span>
      {row.peer ? (
        <Link href="/transactions?category=none" className="shrink-0 text-xs font-semibold text-accent-text hover:underline">
          Payment app: set each on Transactions
        </Link>
      ) : (
        <span className="flex shrink-0 flex-wrap gap-2">
          {billOnly ? null : (
          <select
            aria-label={`Category for ${row.merchant}`}
            disabled={busy}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) start(async () => setResult(await sortMerchantAction(row.key, v)));
            }}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          >
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          )}
          <select
            aria-label={`Bill ${row.merchant} pays`}
            disabled={busy}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) start(async () => setResult(await merchantPaysBillAction(row.key, v)));
            }}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          >
            <option value="">It pays a bill…</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </span>
      )}
      {result && !result.ok ? (
        <span className="basis-full">
          <ErrorBanner message={result.message} />
        </span>
      ) : null}
    </li>
  );
}
