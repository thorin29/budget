"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GROUPS } from "./sections";

/** The Settings menu: three groups, each page once. */
export function SettingsNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-4 lg:overflow-visible">
      {GROUPS.map((g, i) => (
        <div key={g.title} className="flex shrink-0 gap-1 lg:block lg:divide-y lg:divide-line lg:overflow-hidden lg:rounded-xl lg:border lg:border-line lg:bg-surface/50">
          <p className={`hidden bg-neutral-soft px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted lg:block ${i ? "lg:mt-0" : ""}`}>{g.title}</p>
          {g.items.map((s) => {
            const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={`block shrink-0 rounded-xl px-3 py-2 transition lg:rounded-none ${active ? "bg-surface shadow-[inset_3px_0_0_var(--color-accent)] lg:bg-accent-soft" : "hover:bg-surface"}`}
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
