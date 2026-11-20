import Link from "next/link";
import { listMaybeBills, listUnsorted } from "@/server/sorting";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { Card, PageHeading } from "@/components/ui";
import { SorterRow } from "./sorter";

export const dynamic = "force-dynamic";

const whole = (cents: number) => formatCents(Math.round(cents / 100) * 100).replace(/\.00$/, "");

export default async function UncategorizedPage() {
  const [{ merchants, totalCents }, maybe, categories, bills] = await Promise.all([
    listUnsorted(),
    listMaybeBills(),
    prisma.category.findMany({ where: { active: true, managedForOthers: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }) as Promise<Array<{ id: string; name: string }>>,
    prisma.lineItem.findMany({ where: { active: true, kind: { not: "INCOME" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) as Promise<Array<{ id: string; name: string }>>,
  ]);
  const peer = merchants.filter((m) => m.peer);
  const rest = merchants.filter((m) => !m.peer);
  return (
    <div className="space-y-6">
      <Link href="/insights" className="text-sm text-muted hover:text-foreground">
        ← Insights
      </Link>
      <PageHeading title="Sort Uncategorized" />
      <Card>
        <ul className="space-y-1 text-sm text-muted">
          <li>
            <span className="font-semibold text-foreground">Category:</span> what the spending is (Medical, Groceries…). Its other charges follow.
          </li>
          <li>
            <span className="font-semibold text-foreground">It pays a bill:</span> for giving, a doctor you pay monthly and the like. Every charge from it then
            counts as that bill instead of spending, so it isn&rsquo;t counted twice.
          </li>
        </ul>
      </Card>
      {rest.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {rest.map((m) => (
              <SorterRow key={m.key} row={m} categories={categories} bills={bills} />
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">Nothing left to sort.</p>
        </Card>
      )}
      {maybe.length ? (
        <Card>
          <h2 className="text-base font-bold">Spending That May Be a Bill</h2>
          <p className="mt-1 text-sm text-muted">
            Counted as spending in a category your bills use, but not tied to a bill. If one is a bill paid under another name (church
            giving, a doctor you pay monthly), mark it so it isn&rsquo;t counted twice.
          </p>
          <ul className="mt-2 divide-y divide-line">
            {maybe.map((m) => (
              <SorterRow
                key={m.key}
                row={{ ...m, examples: [m.categoryName] }}
                categories={categories}
                bills={[...bills.filter((b) => m.billIds.includes(b.id)), ...bills.filter((b) => !m.billIds.includes(b.id))]}
                billOnly
              />
            ))}
          </ul>
        </Card>
      ) : null}
      {peer.length ? (
        <Card>
          <h2 className="text-base font-bold">Payment Apps</h2>
          <p className="mt-1 text-sm text-muted">
            Venmo, Zelle and the like carry unrelated payments, so each is set on its own in Transactions.
          </p>
          <ul className="mt-2 divide-y divide-line">
            {peer.map((m) => (
              <SorterRow key={m.key} row={m} categories={categories} bills={bills} />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
