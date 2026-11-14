"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/sign-in/actions";

interface NavItem {
  href: string;
  label: string;
  /** Path prefixes that count as this section. */
  match: string[];
  icon: ReactNode;
}

const stroke = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const MAIN: NavItem[] = [
  {
    href: "/month",
    label: "This month",
    match: ["/month"],
    icon: (
      <svg {...stroke}>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: "/projection",
    label: "What can I pay?",
    match: ["/projection"],
    icon: (
      <svg {...stroke}>
        <path d="M3 17l5-5 4 3 8-8" />
        <path d="M15 7h5v5" />
      </svg>
    ),
  },
  {
    href: "/line-items",
    label: "Line items",
    match: ["/line-items"],
    icon: (
      <svg {...stroke}>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <circle cx="4.5" cy="6" r="1" />
        <circle cx="4.5" cy="12" r="1" />
        <circle cx="4.5" cy="18" r="1" />
      </svg>
    ),
  },
  {
    href: "/year",
    label: "Year & reports",
    match: ["/year"],
    icon: (
      <svg {...stroke}>
        <path d="M5 20V11M12 20V5M19 20v-6" />
      </svg>
    ),
  },
];

const SETTINGS: NavItem = {
  href: "/settings",
  label: "Settings",
  match: ["/settings", "/setup", "/import"],
  icon: (
    <svg {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
};

function isActive(pathname: string, item: NavItem) {
  return item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-accent-soft text-accent-ink"
          : "text-muted hover:bg-neutral-soft hover:text-foreground"
      }`}
    >
      <span className={active ? "text-accent-text" : ""}>{item.icon}</span>
      {item.label}
    </Link>
  );
}

function Mark() {
  return (
    <Link href="/month" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M5 12l4 4L19 7" />
        </svg>
      </span>
      <span className="font-heading text-[17px] font-bold tracking-tight">Budget</span>
    </Link>
  );
}

function SignOut({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await signOutAction();
        // A full load, so nothing from the signed-in page lingers.
        window.location.assign(result.ok && result.redirect ? result.redirect : "/sign-in");
      }}
      className={
        compact
          ? "text-xs font-semibold text-muted hover:text-foreground"
          : "rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-muted transition hover:bg-neutral-soft hover:text-foreground"
      }
    >
      Sign out
    </button>
  );
}

export function Sidebar({ version, username }: { version: string; username: string }) {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {/* Narrow screens: a bar across the top. */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Mark />
          <span className="flex items-center gap-3 text-xs text-subtle">
            {version}
            <SignOut compact />
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Main">
          {[...MAIN, SETTINGS].map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
      </header>

      {/* Wide screens: a fixed column. */}
      <aside className="sticky top-0 hidden h-screen w-62 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="px-2">
          <Mark />
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {MAIN.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <NavLink item={SETTINGS} pathname={pathname} />
          <div className="mt-2 flex items-center justify-between border-t border-line px-3 pt-3">
            <span className="truncate text-sm font-medium" title="Signed in">
              {username}
            </span>
            <SignOut />
          </div>
          <p className="px-3 pt-1 text-xs text-subtle">{version}</p>
        </div>
      </aside>
    </>
  );
}
