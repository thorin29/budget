import Link from "next/link";
import { listBankAccounts, listBankTransactions } from "@/server/bank/accounts";
import { formatCents } from "@/lib/money";
import { listCategories } from "@/server/categories";
import { CategoryCell } from "./category-cell";
import { Card, EmptyState, PageHeading, Pill, Select, TextInput, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; q?: string; category?: string }>;
}) {
  const { account, q, category } = await searchParams;
  const [accounts, categories] = await Promise.all([listBankAccounts(), listCategories()]);
  const accountId = accounts.some((a) => a.id === account) ? account : undefined;
  const categoryFilter = category === "none" || categories.some((c) => c.id === category) ? category : undefined;
  const rows = accounts.length ? await listBankTransactions({ accountId, query: q, category: categoryFilter, take: 300 }) : [];
  const options = categories.map((c) => ({ id: c.id, name: c.name, managedForOthers: c.managedForOthers }));

  return (
    <div>
      <PageHeading
        title="Transactions"
        description="What the bank feed and imported files have delivered, newest first. Set a category once for a merchant and it's remembered."
        action={
          <Link href="/settings/bank" className={buttonClass("quiet")}>
            Bank sync settings
          </Link>
        }
      />
      {!accounts.length ? (
        <EmptyState>
          Nothing yet. Connect bank sync in{" "}
          <Link href="/settings/bank" className="font-semibold text-accent-text hover:underline">
            Settings → Bank sync
          </Link>
          .
        </EmptyState>
      ) : (
        <Card className="p-0">
          <form className="flex flex-wrap gap-2 border-b border-line p-4" method="get">
            <Select name="account" defaultValue={accountId ?? ""} className="max-w-72" aria-label="Account">
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution ? `${a.institution} · ${a.name}` : a.name}
                </option>
              ))}
            </Select>
            <Select name="category" defaultValue={categoryFilter ?? ""} className="max-w-56" aria-label="Category">
              <option value="">All categories</option>
              <option value="none">Uncategorized spending</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <TextInput name="q" defaultValue={q ?? ""} placeholder="Search" className="max-w-48" aria-label="Search" />
            <button type="submit" className={buttonClass("quiet")}>
              Filter
            </button>
          </form>
          {rows.length ? (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{r.merchant}</span>
                      {r.kind === "TRANSFER" ? <Pill tone="neutral">Transfer</Pill> : null}
                      {r.kind === "IGNORED" ? <Pill tone="neutral">Ignored</Pill> : null}
                      {r.pending ? <Pill tone="warn">Pending</Pill> : null}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {day.format(r.postedOn)} · {r.accountName} · {r.description}
                      {r.source === "csv" ? " · from file" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-start gap-4">
                    {r.kind === "NORMAL" || r.categorySource === "person" ? (
                      <CategoryCell
                        txn={{ id: r.id, merchant: r.merchant, categoryId: r.categoryId, categorySource: r.categorySource, peer: r.peer }}
                        categories={options}
                      />
                    ) : null}
                    <span className={`tnum w-24 text-right font-semibold ${r.amountCents > 0 ? "text-ok" : ""} ${r.kind !== "NORMAL" ? "text-muted" : ""}`}>
                      {formatCents(r.amountCents)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">No matches.</p>
          )}
        </Card>
      )}
    </div>
  );
}
