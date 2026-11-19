/**
 * One budget's spending for the month, on its own page: each category with its total and a bar,
 * then every charge in it, with the merchants that add up to the most first.
 */

import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { Card } from "@/components/ui";
import { TIERS, shade } from "../../parts";
import { MonthPicker, TabHeading, pickMonth, monthLabel } from "../../../shared";

export const dynamic = "force-dynamic";

const exact = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function BudgetSpendingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, { m }] = await Promise.all([params, searchParams]);
  const picked = pickMonth(m);
  const plan = await getMonthPlan(picked.year, picked.month).catch(() => null);
  const group = plan?.groups.find((g) => g.id === decodeURIComponent(id)) ?? null;
  // The same shade the spending chart gives this budget.
  const tier = TIERS.find((t) => t.tier === group?.tier);
  const peers = (plan?.groups ?? []).filter((g) => g.tier === group?.tier && g.spentCents > 0).sort((a, b) => b.spentCents - a.spentCents);
  const color = group && tier ? shade(tier.color, Math.max(0, peers.findIndex((g) => g.id === group.id)), peers.length) : "var(--series-1)";
  const top = group ? Math.max(1, ...group.categories.map((c) => c.spentCents)) : 1;
  const back = `/insights/money/everyday?m=${plan?.month ?? ""}`;

  return (
    <div className="space-y-4">
      <InsightsTabs right={<MonthPicker path={`/insights/money/budget/${id}`} year={picked.year} month={picked.month} />} />
      <TabHeading title={group?.name ?? "Spending"} />
      <Link href={back} className="inline-block text-sm text-muted hover:text-foreground">
        ← Everyday spending
      </Link>
      {!group ? (
        <Card>
          <p className="text-sm text-muted">Nothing spent in this budget in {monthLabel(picked.year, picked.month, "long")}.</p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: color }} />
                {group.name}
              </h2>
              <p className="tnum text-sm">
                <b className="text-lg">{exact(group.spentCents)}</b>
                {group.limitCents ? <span className="text-muted"> of {exact(group.limitCents)} budget</span> : null}
                <span className="text-muted"> · {monthLabel(picked.year, picked.month, "long")}</span>
              </p>
            </div>
            <ul className="mt-3 space-y-2">
              {[...group.categories]
                .sort((a, b) => b.spentCents - a.spentCents)
                .map((c) => (
                  <li key={c.id ?? "none"}>
                    <a href={`#cat-${c.id ?? "none"}`} className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_6rem] items-center gap-3 text-sm hover:underline">
                      <span className="truncate">{c.name}</span>
                      <span className="h-2.5 rounded-full bg-neutral-soft">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, (c.spentCents / top) * 100)}%`, background: color }} />
                      </span>
                      <span className="tnum text-right font-semibold">{exact(c.spentCents)}</span>
                    </a>
                  </li>
                ))}
            </ul>
          </Card>
          {[...group.categories]
            .sort((a, b) => b.spentCents - a.spentCents)
            .map((c) => {
              const byMerchant = new Map<string, number>();
              for (const t of c.transactions) byMerchant.set(t.name, (byMerchant.get(t.name) ?? 0) + t.cents);
              const merchants = [...byMerchant].sort((a, b) => b[1] - a[1]);
              return (
                <Card key={c.id ?? "none"}>
                  <div id={`cat-${c.id ?? "none"}`} className="flex flex-wrap items-baseline justify-between gap-3 scroll-mt-4">
                    <h3 className="text-base font-bold">{c.name}</h3>
                    <span className="tnum text-sm font-semibold">{exact(c.spentCents)}</span>
                  </div>
                  {merchants.length > 1 ? (
                    <p className="mt-1 text-xs text-muted">
                      {merchants
                        .slice(0, 5)
                        .map(([name, cents]) => `${name} ${exact(cents)}`)
                        .join(" · ")}
                      {merchants.length > 5 ? ` · ${merchants.length - 5} more` : ""}
                    </p>
                  ) : null}
                  <ul className="mt-2 divide-y divide-line text-sm">
                    {[...c.transactions]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((t, i) => (
                        <li key={`${t.id}:${i}`} className="flex items-baseline justify-between gap-3 py-1.5">
                          <span className="min-w-0 truncate">
                            <span className="tnum text-xs text-muted">{day(t.date)}</span> {t.name}
                            {t.pending ? <span className="text-muted"> · pending</span> : null}
                            {t.split ? <span className="text-muted"> · part of an order</span> : null}
                          </span>
                          <span className="tnum shrink-0">{exact(t.cents)}</span>
                        </li>
                      ))}
                  </ul>
                </Card>
              );
            })}
        </>
      )}
    </div>
  );
}
