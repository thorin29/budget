"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { signOutAction } from "@/app/sign-in/actions";

interface NavItem {
  href: string;
  label: string;
  /** Path prefixes that count as this section. */
  match: string[];
  icon: IconName;
}

const MAIN: NavItem[] = [
  {
    href: "/month",
    label: "Tracker",
    // "What can I pay?" opens from the month's 45-day card.
    match: ["/month", "/projection"],
    icon: "table",
  },
  {
    href: "/review",
    label: "Review",
    match: ["/review"],
    icon: "check",
  },
  {
    href: "/transactions",
    label: "Transactions",
    match: ["/transactions"],
    icon: "list-bullets",
  },
  {
    href: "/insights",
    label: "Insights",
    // The year plan is a tab of Insights.
    match: ["/insights", "/year"],
    icon: "chart-pie-slice",
  },
  {
    href: "/accounts",
    label: "Accounts",
    match: ["/accounts"],
    icon: "bank",
  },
];

const SETTINGS: NavItem = {
  href: "/settings",
  label: "Settings",
  // Bills & income (line items) lives under Settings.
  match: ["/settings", "/setup", "/import", "/line-items"],
  icon: "gear-six",
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
      <Icon name={item.icon} weight={active ? "fill" : "regular"} size={19} className={active ? "text-accent-text" : ""} />
      {item.label}
    </Link>
  );
}

function Mark() {
  return (
    <Link href="/month" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-on-accent">
        <svg width="18" height="18" viewBox="0 0 48 48" fill="currentColor" aria-hidden>
          <rect x="10" y="12" width="20" height="6" rx="3" />
          <rect x="10" y="21" width="26" height="6" rx="3" opacity="0.75" />
          <rect x="10" y="30" width="16" height="6" rx="3" opacity="0.5" />
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
