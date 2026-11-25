/** Owed to You: what each person owes for charges marked in Transactions (src/server/owed.ts). */

import Link from "next/link";
import { owedSummary } from "@/server/owed";
import { formatCents } from "@/lib/money";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const date = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));

export default async function OwedPage() {
  const list = await owedSummary();
  const open = list.reduce((s, p) => s + Math.max(0, p.openCents), 0);
  return (
    <div className="max-w-[860px] space-y-4">
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
        list.map((p) => {
          const shown = [...p.charges].reverse();
          return (
            <Card key={p.id} padded={false}>
              <div className="px-5 pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-bold">{p.name}</h2>
                  <span className="tnum text-xl font-extrabold">{p.openCents < 0 ? `${formatCents(-p.openCents)} ahead` : formatCents(p.openCents)}</span>
                </div>
                <p className="tnum mt-0.5 text-xs text-muted">
                  {formatCents(p.markedCents)} owed · {formatCents(p.paidCents)} paid back
                  {p.paybacks.length ? `, last ${date(p.paybacks[p.paybacks.length - 1].postedOn)}` : ""}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-soft">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${p.markedCents ? Math.min(100, (p.paidCents / p.markedCents) * 100) : 0}%` }} />
                </div>
              </div>
              <ul className="mt-3 divide-y divide-dashed divide-line border-t border-line text-sm">
                {shown.map((c, i) => {
                  const paid = c.coveredCents >= c.cents;
                  return (
                    <li key={`${c.txnId}-${i}`} className={`tnum flex justify-between gap-3 px-5 py-2 ${paid ? "text-muted line-through" : ""}`}>
                      <span className="truncate">
                        {date(c.postedOn)} · {c.merchant}
                      </span>
                      <span className="whitespace-nowrap">
                        {!paid && c.coveredCents ? <span className="mr-2 text-xs text-muted no-underline">{formatCents(c.cents - c.coveredCents)} left of</span> : null}
                        {formatCents(c.cents)}
                      </span>
                    </li>
                  );
                })}
                {[...p.paybacks].reverse().map((b, i) => (
                  <li key={`${b.txnId}-p${i}`} className="tnum flex justify-between gap-3 px-5 py-2 text-ok">
                    <span className="truncate">
                      {date(b.postedOn)} · Paid back · {b.merchant}
                    </span>
                    <span className="whitespace-nowrap">+{formatCents(b.cents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
