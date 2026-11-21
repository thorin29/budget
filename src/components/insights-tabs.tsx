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
  { href: "/insights/debt", label: "Debt & Net Worth", month: false },
  { href: "/insights/trends", label: "Trends", month: true },
  { href: "/year", label: "Year Plan", month: false },
];

/** Where each tab's figures are set: Insights only shows them. */
const SET_IN: Record<string, { href: string; label: string }> = {
  "/insights/budget": { href: "/settings/budgets", label: "Budgets" },
  "/insights/money": { href: "/settings/budgets", label: "Budgets" },
  "/insights/cash": { href: "/settings/accounts", label: "Cushion" },
  "/insights/calendar": { href: "/line-items", label: "Bills" },
  "/insights/debt": { href: "/line-items", label: "Loans" },
  "/year": { href: "/line-items", label: "Bills" },
};

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
              // Fetched ahead in the background, so switching tabs shows the page at once.
              prefetch
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

/** At the foot of each Insights page: where that page's figures are set. */
export function SettingsFooter() {
  const pathname = usePathname() ?? "";
  const key = pathname.startsWith("/year") ? "/year" : Object.keys(SET_IN).filter((k) => pathname.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  const to = key ? SET_IN[key] : null;
  if (!to) return null;
  return (
    <p className="mt-6 text-right text-xs">
      <Link href={to.href} className="font-semibold text-accent-text hover:underline">
        {to.label}: change in Settings →
      </Link>
    </p>
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
