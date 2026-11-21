/**
 * Review in two columns: action items (bills that look paid, due days the bank moved, bill
 * amounts the payments say changed, charges that repeat) on the left, and bill payments recorded automatically from the bank feed on the right,
 * grouped by bill (open one for each month, each with its Undo).
 */

import { getReview } from "@/server/review";
import { Card } from "@/components/ui";
import { recentAutomation } from "@/server/bills-auto";
import { formatCents } from "@/lib/money";
import { AmountCard, AutoRecordedRow, DueDayRow, LooksPaidCard, RepeatCard } from "./cards";
import { amountSuggestions } from "@/server/bill-amounts";
import { listCategories } from "@/server/categories";
import { needsCategory } from "@/server/needs-category";
import { CategoryCell } from "../transactions/category-cell";

export const dynamic = "force-dynamic";

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function ReviewPage() {
  const [review, auto, amounts, categoryRows, uncategorized] = await Promise.all([getReview(), recentAutomation(), amountSuggestions().catch(() => []), listCategories(), needsCategory().catch(() => [])]);
  const categories = categoryRows.map((c) => ({ id: c.id, name: c.name }));
  const options = categoryRows.map((c) => ({ id: c.id, name: c.name, managedForOthers: c.managedForOthers }));
  const waiting = review.count + auto.moved.length + amounts.length + uncategorized.length;

  // Recorded payments grouped by bill, newest month first, bills with the newest payment first.
  const byBill = new Map<string, typeof auto.recorded>();
  for (const r of auto.recorded) byBill.set(r.lineItemId, [...(byBill.get(r.lineItemId) ?? []), r]);
  const groups = [...byBill.values()]
    .map((list) => list.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month)))
    .sort((a, b) => (b[0].paidOn ?? "").localeCompare(a[0].paidOn ?? ""));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-heading text-[28px] font-bold tracking-tight">Review</h1>
        <p className="text-sm text-muted">Updated after each bank sync</p>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="space-y-3 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">Action Items</h2>
            {waiting ? <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn">{waiting}</span> : null}
          </div>
          {waiting === 0 ? <p className="text-sm text-muted">All caught up.</p> : null}
          {review.looksPaid.length ? (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Bills That Look Paid</h3>
              <ul className="space-y-2">
                {review.looksPaid.map((item) => (
                  <LooksPaidCard key={`${item.lineItemId}:${item.year}:${item.month}:${item.txnId}`} item={item} />
                ))}
              </ul>
            </section>
          ) : null}
          {auto.moved.length ? (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Due Days the Bank Moved</h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {auto.moved.map((m) => (
                  <DueDayRow key={m.lineItemId} item={m} />
                ))}
              </ul>
            </section>
          ) : null}
          {amounts.length ? (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Amounts That Changed</h3>
              <ul className="space-y-2">
                {amounts.map((item) => (
                  <AmountCard key={item.lineItemId} item={item} />
                ))}
              </ul>
            </section>
          ) : null}
          {uncategorized.length ? (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Needs a Category</h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {uncategorized.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{t.merchant}</b>
                      <span className="block truncate text-xs text-muted">
                        {short(t.postedOn)}{t.pending ? " (pending)" : ""} · {t.accountName} · <span className="tnum">{formatCents(t.amountCents)}</span>
                      </span>
                    </span>
                    <CategoryCell txn={{ id: t.id, merchant: t.merchant, categoryId: null, categorySource: "guess", peer: t.peer }} categories={options} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {review.repeats.length ? (
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Charges That Repeat Every Month</h3>
              <ul className="space-y-2">
                {review.repeats.map((item) => (
                  <RepeatCard key={item.merchantKey} item={item} />
                ))}
              </ul>
            </section>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">Recorded Automatically</h2>
            <span className="text-xs text-muted">Bill payments matched from the bank feed in the last 10 days · open one to change or unrecord it</span>
          </div>
          {groups.length ? (
            <ul className="mt-2 divide-y divide-line">
              {groups.map((list) => {
                const latest = list[0];
                return (
                  <li key={latest.lineItemId} className="py-1">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 rounded-lg px-1 py-1.5 hover:bg-neutral-soft">
                        <span>
                          <span aria-hidden className="mr-1.5 inline-block text-muted transition-transform group-open:rotate-90">›</span>
                          <b>{latest.name}</b>{" "}
                          <span className="text-xs text-muted">
                            · {list.length} {list.length === 1 ? "month" : "months"} recorded
                          </span>
                        </span>
                        <span className="tnum text-xs text-muted">
                          latest {latest.paidOn ? short(latest.paidOn) : ""} · {formatCents(latest.amountCents)}
                        </span>
                      </summary>
                      <ul className="mb-1 ml-4 max-h-[26rem] divide-y divide-line overflow-y-auto rounded-xl bg-neutral-soft">
                        {list.map((r) => (
                          <AutoRecordedRow key={`${r.lineItemId}:${r.year}:${r.month}`} item={r} categories={categories} />
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing recorded on its own yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
