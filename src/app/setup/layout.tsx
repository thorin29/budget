import Link from "next/link";
import { versionLabel } from "@/lib/version";

const STEPS = [
  { href: "/setup", label: "Overview" },
  { href: "/setup/accounts", label: "Accounts" },
  { href: "/setup/categories", label: "Categories" },
  { href: "/setup/pay", label: "Pay calendar" },
  { href: "/setup/preferences", label: "Preferences" },
  { href: "/import", label: "Import" },
];

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-10">
      <header className="mb-8">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          Budget
        </Link>
        <nav className="mt-4 flex flex-wrap gap-1 border-b border-line pb-px">
          {STEPS.map((step) => (
            <Link
              key={step.href}
              href={step.href}
              className="rounded-t-md px-3 py-2 text-sm text-muted transition hover:bg-accent-soft hover:text-foreground"
            >
              {step.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-12 text-xs text-muted">{versionLabel()}</footer>
    </div>
  );
}
