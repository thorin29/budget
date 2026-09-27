import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { versionLabel } from "@/lib/version";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [accounts, items] = await Promise.all([
    prisma.account.count(),
    prisma.lineItem.count(),
  ]);

  const needsSetup = accounts === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>

      {needsSetup ? (
        <>
          <p className="mt-3 max-w-prose text-sm text-muted">
            Nothing configured yet. Setup covers accounts, categories, the pay
            calendar, and a few preferences — then line items.
          </p>
          <div className="mt-6">
            <Link href="/setup">
              <Button>Start setup</Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            {accounts} account{accounts === 1 ? "" : "s"}, {items} line item
            {items === 1 ? "" : "s"}.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/month">
              <Button>This month</Button>
            </Link>
            <Link href="/line-items">
              <Button variant="quiet">Line items</Button>
            </Link>
            <Link href="/setup">
              <Button variant="quiet">Setup</Button>
            </Link>
          </div>
        </>
      )}

      <footer className="mt-auto pt-12 text-xs text-muted">{versionLabel()}</footer>
    </main>
  );
}
