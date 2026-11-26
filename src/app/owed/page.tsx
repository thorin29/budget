/** Owed to You: what each person owes for charges marked in Transactions, and linking their payments (src/server/owed.ts). */

import Link from "next/link";
import { owedSummary } from "@/server/owed";
import { formatCents } from "@/lib/money";
import { EmptyState } from "@/components/ui";
import { PersonCard } from "./person-card";

export const dynamic = "force-dynamic";

export default async function OwedPage() {
  const list = await owedSummary();
  const open = list.reduce((s, p) => s + Math.max(0, p.openCents), 0);
  return (
    <div className="max-w-[1100px] space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-heading text-[28px] font-bold tracking-tight">Owed to You</h1>
        {list.length ? <span className="tnum text-sm text-muted">{formatCents(open)} open</span> : null}
      </div>
      {!list.length ? (
        <EmptyState>
          Nothing yet. In{" "}
          <Link href="/transactions" className="font-semibold text-accent-text hover:underline">
            Transactions
          </Link>
          , pick <b>Someone owes me</b> on a charge.
        </EmptyState>
      ) : (
        list.map((p) => <PersonCard key={p.id} person={p} />)
      )}
    </div>
  );
}
