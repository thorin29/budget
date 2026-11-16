import Link from "next/link";
import { getReview } from "@/server/review";
import { EmptyState, PageHeading, buttonClass } from "@/components/ui";
import { LooksPaidCard, RepeatCard } from "./cards";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const review = await getReview();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeading
        title="Review"
        description="What the bank feed noticed that needs you. Nothing is recorded until you confirm it."
        action={
          <Link href="/transactions" className={buttonClass("quiet")}>
            Transactions
          </Link>
        }
      />

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
