/**
 * Transactions, a month at a time and a page at a time: a search box, account and category, and
 * quick filters (needs a category, guessed, money in, transfers) on top; 20 rows a page; and the
 * month's figures beside them, from the same month plan as Insights so they match it.
 */

import Link from "next/link";
import { listBankAccounts, listBankTransactions } from "@/server/bank/accounts";
import { getMonthPlan } from "@/server/month-plan";
import { formatCents } from "@/lib/money";
import { listCategories } from "@/server/categories";
import { CategoryCell } from "./category-cell";
import { SplitRow } from "./split-row";
import { Card, EmptyState, Pill, Select, TextInput, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const whole = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const QUICK: Array<[string, string]> = [
  ["", "All"],
  ["none", "Needs a category"],
  ["guessed", "Guessed"],
  ["in", "Money in"],
  ["transfer", "Transfers & card payments"],
];

function shift(ym: string, by: number) {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ account?: string; q?: string; category?: string; m?: string; f?: string; p?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) && sp.m <= thisMonth ? sp.m : thisMonth;
  const [accounts, categories] = await Promise.all([listBankAccounts(), listCategories()]);
  const accountId = accounts.some((a) => a.id === sp.account) ? sp.account : undefined;
  const categoryFilter = sp.category === "none" || categories.some((c) => c.id === sp.category) ? sp.category : undefined;
  const quick = QUICK.some(([k]) => k === sp.f) ? (sp.f ?? "") : "";
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [all, plan] = await Promise.all([
    accounts.length ? listBankTransactions({ accountId, query: sp.q, category: quick === "none" ? "none" : categoryFilter, take: 1000, from: `${month}-01`, to: last }) : Promise.resolve([]),
    getMonthPlan(Number(month.slice(0, 4)), Number(month.slice(5, 7))).catch(() => null),
  ]);
  const rows = all.filter((r) => (quick === "guessed" ? r.categorySource === "guess" && r.kind === "NORMAL" && !r.splits.length : quick === "in" ? r.amountCents > 0 && r.kind === "NORMAL" : quick === "transfer" ? r.kind === "TRANSFER" : true));
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.p) || 1));
  const shown = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const options = categories.map((c) => ({ id: c.id, name: c.name, managedForOthers: c.managedForOthers }));
  const counts = { none: all.filter((r) => r.kind === "NORMAL" && r.amountCents < 0 && (r.splits.length ? r.splits.some((p) => !p.categoryId) : !r.categoryId)).length, guessed: all.filter((r) => r.categorySource === "guess" && r.kind === "NORMAL" && !r.splits.length).length };
  const href = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { account: accountId, q: sp.q, category: categoryFilter, m: month === thisMonth ? undefined : month, f: quick || undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/transactions${s ? `?${s}` : ""}`;
  };
  const topCats = plan
    ? plan.groups
        .flatMap((g) => g.categories)
        .filter((c) => c.spentCents > 0)
        .sort((a, b) => b.spentCents - a.spentCents)
        .slice(0, 6)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-[28px] font-bold tracking-tight">Transactions</h1>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 text-sm">
          <Link href={href({ m: shift(month, -1), p: undefined })} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
            ‹ {label(shift(month, -1)).split(" ")[0].slice(0, 3)}
          </Link>
          <span className="px-2.5 py-1 font-semibold">{label(month)}</span>
          {month < thisMonth ? (
            <Link href={href({ m: shift(month, 1) === thisMonth ? undefined : shift(month, 1), p: undefined })} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
              {label(shift(month, 1)).split(" ")[0].slice(0, 3)} ›
            </Link>
          ) : (
            <span className="px-2.5 py-1 text-muted/50">{label(shift(month, 1)).split(" ")[0].slice(0, 3)} ›</span>
          )}
        </div>
      </div>
      {!accounts.length ? (
        <EmptyState>
          Nothing yet. Connect bank sync in{" "}
          <Link href="/settings/bank" className="font-semibold text-accent-text hover:underline">
            Settings › Bank connection
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <Card className="p-0">
            <form className="flex flex-wrap items-center gap-2 border-b border-line p-3" method="get">
              {month !== thisMonth ? <input type="hidden" name="m" value={month} /> : null}
              {quick ? <input type="hidden" name="f" value={quick} /> : null}
              <TextInput name="q" defaultValue={sp.q ?? ""} placeholder="Search merchant" className="max-w-52" aria-label="Search" />
              <Select name="account" defaultValue={accountId ?? ""} className="max-w-60" aria-label="Account">
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution ? `${a.institution} · ${a.displayName}` : a.displayName}
                  </option>
                ))}
              </Select>
              <Select name="category" defaultValue={categoryFilter ?? ""} className="max-w-52" aria-label="Category">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("quiet")}>
                Filter
              </button>
              <span className="flex flex-wrap gap-1.5">
                {QUICK.map(([k, text]) => {
                  const n = k === "none" ? counts.none : k === "guessed" ? counts.guessed : null;
                  return (
                    <Link key={k} href={href({ f: k || undefined, p: undefined })} className={`rounded-full border px-3 py-1 text-xs font-semibold ${quick === k ? "border-accent bg-accent-soft text-accent-text" : "border-line hover:bg-neutral-soft"}`}>
                      {text}
                      {n ? ` (${n})` : ""}
                    </Link>
                  );
                })}
              </span>
            </form>
            {shown.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed text-sm">
                  <tbody className="divide-y divide-line">
                    {shown.map((r) => {
                      const cells = (
                        <>
                          <td className="tnum w-16 whitespace-nowrap py-1.5 pl-4 text-xs text-muted">{day.format(r.postedOn)}</td>
                          <td className="max-w-0 py-1.5 pr-3">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-semibold" title={r.description}>
                                {r.merchant}
                              </span>
                              {r.kind === "TRANSFER" ? <Pill tone="neutral">Transfer</Pill> : null}
                              {r.kind === "IGNORED" ? <Pill tone="neutral">Ignored</Pill> : null}
                              {r.pending ? <Pill tone="warn">Pending</Pill> : null}
                            </span>
                          </td>
                          <td className="w-40 truncate pr-3 text-xs text-muted">{r.accountName}</td>
                        </>
                      );
                      const amount = <td className={`tnum w-28 whitespace-nowrap pr-4 text-right font-semibold ${r.amountCents > 0 ? "text-ok" : ""} ${r.kind !== "NORMAL" ? "text-muted" : ""}`}>{formatCents(r.amountCents)}</td>;
                      if (r.splits.length) return <SplitRow key={r.id} cells={cells} amount={amount} parts={r.splits} categories={options} />;
                      return (
                        <tr key={r.id}>
                          {cells}
                          <td className="w-56 pr-3">
                            {r.kind === "NORMAL" || r.kind === "TRANSFER" || r.categorySource === "person" ? (
                              <CategoryCell txn={{ id: r.id, merchant: r.merchant, categoryId: r.categoryId, categorySource: r.categorySource, peer: r.peer, transfer: r.kind === "TRANSFER" }} categories={options} />
                            ) : null}
                          </td>
                          {amount}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-sm text-muted">No matches in {label(month)}.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
              <span>
                {rows.length ? `${(page - 1) * PER_PAGE + 1}–${Math.min(rows.length, page * PER_PAGE)} of ${rows.length}` : "0"} in {label(month)}
              </span>
              {pages > 1 ? (
                <span className="flex items-center gap-1">
                  {page > 1 ? (
                    <Link href={href({ p: String(page - 1) })} className="rounded px-2 py-1 hover:bg-neutral-soft">
                      ‹
                    </Link>
                  ) : null}
                  {Array.from({ length: pages }, (_, i) => i + 1)
                    .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2)
                    .map((n, i, list) => (
                      <span key={n} className="flex items-center">
                        {i && n - list[i - 1] > 1 ? <span className="px-1">…</span> : null}
                        <Link href={href({ p: String(n) })} className={`rounded px-2 py-1 ${n === page ? "font-bold text-foreground" : "hover:bg-neutral-soft"}`}>
                          {n}
                        </Link>
                      </span>
                    ))}
                  {page < pages ? (
                    <Link href={href({ p: String(page + 1) })} className="rounded px-2 py-1 hover:bg-neutral-soft">
                      ›
                    </Link>
                  ) : null}
                </span>
              ) : null}
            </div>
          </Card>
          {plan ? (
            <Card className="space-y-3 p-4 text-sm">
              <h2 className="text-base font-bold">{label(month).split(" ")[0]}{month === thisMonth ? " so far" : ""}</h2>
              <dl className="divide-y divide-line">
                {(
                  [
                    ["Income received", plan.income.receivedCents, "text-ok"],
                    ["Everyday spending", plan.spentCents, ""],
                    ["Bills paid", plan.bills.listPaidCents, ""],
                  ] as Array<[string, number, string]>
                ).map(([k, v, cls]) => (
                  <div key={k} className="flex justify-between py-1.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className={`tnum font-semibold ${cls}`}>{whole(v)}</dd>
                  </div>
                ))}
              </dl>
              {topCats.length ? (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Top Categories</h3>
                  <ul className="mt-1 space-y-1">
                    {topCats.map((c) => (
                      <li key={c.id ?? "none"}>
                        <Link href={href({ category: c.id ?? undefined, f: c.id ? undefined : "none", p: undefined })} className="flex justify-between hover:underline">
                          <span className="truncate">{c.name}</span>
                          <span className="tnum">{whole(c.spentCents)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2 text-xs font-semibold">
                <a href="/transactions/export?what=transactions" className="text-accent-text hover:underline">
                  Download CSV
                </a>
                <Link href="/settings/bank" className="text-accent-text hover:underline">
                  Bank connection
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
