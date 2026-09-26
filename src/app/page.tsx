import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [accounts, items] = await Promise.all([
    prisma.account.count(),
    prisma.lineItem.count(),
  ]);

  const needsSetup = accounts === 0 && items === 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>

      {needsSetup ? (
        <p className="mt-4 text-sm opacity-70">
          Nothing configured yet. Setup will walk through creating accounts,
          categories, line items, and the pay calendar.
        </p>
      ) : (
        <p className="mt-4 text-sm opacity-70">
          {accounts} account{accounts === 1 ? "" : "s"}, {items} line item
          {items === 1 ? "" : "s"}.
        </p>
      )}
    </main>
  );
}
