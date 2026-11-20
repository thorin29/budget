"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GROUPS } from "./sections";

/** The Settings menu: three groups, each page once. */
export function SettingsNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:flex-col lg:gap-0 lg:overflow-y-auto">
      {GROUPS.map((g, i) => (
        <div key={g.title} className="flex shrink-0 gap-1 lg:block">
          <p className={`hidden px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted lg:block ${i ? "pt-5" : ""}`}>{g.title}</p>
          {g.items.map((s) => {
            const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={`block shrink-0 rounded-xl px-3 py-2 transition ${active ? "bg-surface shadow-card ring-1 ring-line" : "hover:bg-surface/60"}`}
              >
                <span className={`block text-sm font-semibold ${active ? "text-foreground" : "text-muted"}`}>{s.label}</span>
                {s.detail ? <span className="hidden text-xs text-subtle lg:block">{s.detail}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
