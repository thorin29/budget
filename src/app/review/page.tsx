import Link from "next/link";
import { getReview } from "@/server/review";
import { EmptyState, PageHeading, buttonClass } from "@/components/ui";
import { recentAutomation } from "@/server/bills-auto";
import { AutoRecordedRow, DueDayRow, LooksPaidCard, RepeatCard } from "./cards";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const [review, auto] = await Promise.all([getReview(), recentAutomation()]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeading
        title="Review"
        description="What the bank feed noticed. Exact matches to a bill it already knows are recorded on their own and listed here with an Undo; everything else waits for you."
        action={
          <Link href="/transactions" className={buttonClass("quiet")}>
            Transactions
          </Link>
        }
      />

      {auto.recorded.length || auto.moved.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Done for you</h2>
          {auto.recorded.length ? (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
              {auto.recorded.map((r) => (
                <AutoRecordedRow key={`${r.lineItemId}:${r.year}:${r.month}`} item={r} />
              ))}
            </ul>
          ) : null}
          {auto.moved.length ? (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
              {auto.moved.map((m) => (
                <DueDayRow key={m.lineItemId} item={m} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {review.count === 0 ? (
        <EmptyState>All caught up. New suggestions appear after each morning&rsquo;s bank sync.</EmptyState>
      ) : null}

      {review.looksPaid.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Bills that look paid</h2>
          <ul className="space-y-3">
            {review.looksPaid.map((item) => (
              <LooksPaidCard key={`${item.lineItemId}:${item.year}:${item.month}:${item.txnId}`} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {review.repeats.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Charges that repeat every month</h2>
          <ul className="space-y-3">
            {review.repeats.map((item) => (
              <RepeatCard key={item.merchantKey} item={item} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
