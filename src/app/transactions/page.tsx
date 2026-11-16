import Link from "next/link";
import { listBankAccounts, listBankTransactions } from "@/server/bank/accounts";
import { formatCents } from "@/lib/money";
import { Card, EmptyState, PageHeading, Pill, Select, TextInput, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; q?: string }>;
}) {
  const { account, q } = await searchParams;
  const accounts = await listBankAccounts();
  const accountId = accounts.some((a) => a.id === account) ? account : undefined;
  const rows = accounts.length ? await listBankTransactions({ accountId, query: q, take: 300 }) : [];

  return (
    <div>
      <PageHeading
        title="Transactions"
        description="What the bank feed and imported files have delivered, newest first. Read-only for now."
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
                  <span className={`tnum shrink-0 font-semibold ${r.amountCents > 0 ? "text-ok" : ""} ${r.kind !== "NORMAL" ? "text-muted" : ""}`}>
                    {formatCents(r.amountCents)}
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
