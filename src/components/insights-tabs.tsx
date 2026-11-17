import Link from "next/link";

/** Insights has two views: spending from the bank, and the year plan against what was paid. */
export function InsightsTabs({ active }: { active: "spending" | "year" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? "bg-surface text-foreground shadow-card ring-1 ring-line" : "text-muted hover:text-foreground"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Insights" className="mb-4 inline-flex gap-1 rounded-xl bg-neutral-soft p-1">
      {tab("/insights", "Spending", active === "spending")}
      {tab("/year", "Year plan", active === "year")}
    </nav>
  );
}
