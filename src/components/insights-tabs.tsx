"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Insights is a set of short pages, each answering one question, with the
 * year plan beside them. The month being looked at carries across the tabs
 * that are about a month.
 */
const TABS: Array<{ href: string; label: string; month: boolean }> = [
  { href: "/insights", label: "Overview", month: true },
  { href: "/insights/money", label: "Money", month: true },
  { href: "/insights/budget", label: "Budget", month: true },
  { href: "/insights/cash", label: "Cash", month: false },
  { href: "/insights/calendar", label: "Calendar", month: false },
  { href: "/insights/debt", label: "Debt", month: false },
  { href: "/insights/trends", label: "Trends", month: true },
  { href: "/insights/settings", label: "Settings", month: false },
  { href: "/year", label: "Year plan", month: false },
];

function Tabs({ active }: { active?: "spending" | "year" }) {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const m = params?.get("m");
  const current = active === "year" ? "/year" : TABS.filter((t) => pathname === t.href || (t.href !== "/insights" && pathname.startsWith(t.href))).at(-1)?.href ?? "/insights";
  return (
    <nav aria-label="Insights" className="-mx-1 overflow-x-auto px-1">
      <div className="inline-flex gap-1 rounded-xl bg-neutral-soft p-1">
        {TABS.map((t) => {
          const on = t.href === current;
          return (
            <Link
              key={t.href}
              href={t.month && m ? `${t.href}?m=${m}` : t.href}
              aria-current={on ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? "bg-surface text-foreground shadow-card ring-1 ring-line" : "text-muted hover:text-foreground"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** The tabs, with the month picker (or anything else) at the right end of the same row. */
export function InsightsTabs({ active, right }: { active?: "spending" | "year"; right?: ReactNode } = {}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 max-w-full">
        <Suspense fallback={<div className="h-10" />}>
          <Tabs active={active} />
        </Suspense>
      </div>
      {right}
    </div>
  );
}
