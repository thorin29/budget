"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "./sections";

export function SettingsNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      <Link
        href="/line-items"
        className="shrink-0 rounded-xl px-3 py-2 transition hover:bg-surface/60 lg:py-2.5"
      >
        <span className="block text-sm font-semibold text-muted">Bills &amp; income</span>
        <span className="hidden text-xs text-subtle lg:block">Every bill and paycheck you plan for</span>
      </Link>
      {SECTIONS.map((s) => {
        const active = pathname === `/settings/${s.slug}`;
        return (
          <Link
            key={s.slug}
            href={`/settings/${s.slug}`}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-xl px-3 py-2 transition lg:py-2.5 ${
              active ? "bg-surface shadow-card ring-1 ring-line" : "hover:bg-surface/60"
            }`}
          >
            <span className={`block text-sm font-semibold ${active ? "text-foreground" : "text-muted"}`}>
              {s.label}
            </span>
            <span className="hidden text-xs text-subtle lg:block">{s.detail}</span>
          </Link>
        );
      })}
    </nav>
  );
}
