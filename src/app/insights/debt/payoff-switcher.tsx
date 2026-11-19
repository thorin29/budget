"use client";

/** One payoff chart at a time, with a button for each loan. */

import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui";

export function PayoffSwitcher({ tabs }: { tabs: Array<{ key: string; label: string; panel: ReactNode }> }) {
  const [on, setOn] = useState(tabs[0]?.key ?? "");
  const shown = tabs.find((t) => t.key === on) ?? tabs[0];
  if (!shown) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Payoff</h2>
        <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-soft p-1" role="tablist" aria-label="Loan">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === shown.key}
              onClick={() => setOn(t.key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${t.key === shown.key ? "bg-surface text-foreground shadow-card ring-1 ring-line" : "text-muted hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">{shown.panel}</div>
    </Card>
  );
}
