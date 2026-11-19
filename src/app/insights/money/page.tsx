import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { SUBSCRIPTIONS, unbilledRepeats } from "@/server/subscriptions";
import { getUpcoming } from "@/server/yearly";
import { getInsights } from "@/server/insights";
import { Card } from "@/components/ui";
import { ComingUpRow } from "../coming-up";
import { MonthPicker, TabHeading, pickMonth } from "../shared";
import { BADGE, SpendingChart, exact, isSub, money, day, paidBills as paid, payState, sumBills as sum } from "./parts";

export const dynamic = "force-dynamic";

/** A line of money out that opens its own page. */
function OutRow({ href, title, cents, note, badge }: { href: string; title: string; cents: number; note?: string; badge?: string }) {
  const b = badge ? BADGE[badge] : null;
  return (
    <li>
      <Link href={href} className="-mx-2 flex items-baseline justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-neutral-soft">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title} ›</span>
          {note ? <span className="block text-xs text-muted">{note}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {b ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${b.cls}`}>{b.label}</span> : null}
          <span className="tnum text-sm font-semibold">{money(cents)}</span>
        </span>
      </Link>
    </li>
  );
}

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const picked = pickMonth(m);
  const [plan, repeats, upcoming, insights] = await Promise.all([
    getMonthPlan(picked.year, picked.month),
    picked.isNow ? unbilledRepeats().catch(() => []) : Promise.resolve([]),
    picked.isNow ? getUpcoming().catch(() => []) : Promise.resolve([]),
    getInsights(picked.year, picked.month).catch(() => null),
  ]);
  const bills = plan.bills.items.filter((b) => !isSub(b));
  const subs = plan.bills.items.filter(isSub);
  const outTotal = plan.bills.totalCents + plan.debt.cents + plan.spentCents;
  const net = plan.income.totalCents - outTotal;
  const to = (section: string) => `/insights/money/${section}?m=${plan.month}`;
  const outSoFar = plan.bills.paidCents + (plan.debt.source === "paid" ? plan.debt.cents : 0) + plan.spentCents;
  // Only people with money moving this month; an old running balance on its own isn't news.
  const managed = (insights?.managed ?? []).filter((x) => x.monthInCents !== 0 || x.monthOutCents !== 0);

  return (
    <div className="space-y-6">
      <InsightsTabs right={<MonthPicker {...{ path: "/insights/money", year: picked.year, month: picked.month }} />} />
      <TabHeading title="Money" />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold">Income</h2>
            <span className="tnum text-sm">
              <b>{money(plan.income.receivedCents)}</b> <span className="text-muted">of {money(plan.income.totalCents)} expected</span>
            </span>
          </div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {plan.income.items.map((i) => (
              <li key={`${i.lineItemId}:${i.dueOn}`} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="tnum text-xs text-muted">{day(i.dueOn)}</span> {i.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${i.received ? "bg-ok-soft text-ok" : "bg-neutral-soft text-muted ring-1 ring-line"}`}>
                    {i.received ? "Received" : "Expected"}
                  </span>
                  <span className="tnum">{exact(i.cents)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className={`mt-3 flex justify-between border-t border-line pt-2 text-sm font-semibold ${net < 0 ? "text-danger" : ""}`}>
            <span>Income minus expenses{plan.closed ? "" : ", expected"}</span>
            <span className="tnum">{money(net)}</span>
          </p>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold">Expenses</h2>
            <span className="tnum text-sm">
              <b>{money(outSoFar)}</b> <span className="text-muted">of {money(outTotal)} expected</span>
            </span>
          </div>
          <ul className="mt-1 divide-y divide-line">
            <OutRow href={to("bills")} title="Bills" cents={sum(bills)} badge={payState(paid(bills), sum(bills))} note={`${money(paid(bills))} paid of ${money(sum(bills))}${bills.some((b) => b.status === "overdue") ? " · some overdue" : ""}`} />
            <OutRow href={to("subscriptions")} title={SUBSCRIPTIONS} cents={sum(subs)} badge={subs.length ? payState(paid(subs), sum(subs)) : undefined} note={`${subs.length} bill${subs.length === 1 ? "" : "s"}`} />
            {plan.debt.cents > 0 ? (
              <OutRow
                href={to("debt")}
                title={`Debt payment${plan.debt.name ? `: ${plan.debt.name}` : ""}`}
                cents={plan.debt.cents}
                badge={plan.debt.source === "paid" ? "paid" : "due"}
                note={plan.debt.source === "paid" ? undefined : plan.debt.dueOn ? `Due ${day(plan.debt.dueOn)}` : undefined}
              />
            ) : null}
            {plan.bills.other.length || repeats.length ? (
              <OutRow
                href={to("maybe-bills")}
                title="Charges that may be bills"
                cents={plan.bills.otherCents}
                badge="actual"
                note={`${plan.bills.other.length + repeats.length} to sort`}
              />
            ) : null}
            <OutRow href={to("everyday")} title="Everyday spending" cents={plan.spentCents} badge="actual" note="Essentials, Extras and Unplanned" />
          </ul>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Everyday spending by budget</h2>
          <span className="tnum text-sm">
            <b>{money(plan.spentCents)}</b>
          </span>
        </div>
        <div className="mt-3">
          <SpendingChart groups={plan.groups} month={plan.month} from="money" />
        </div>
      </Card>

      {upcoming.length ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">Coming up</h2>
            <span className="text-xs text-muted">Yearly charges due in the next 45 days, from bank history</span>
          </div>
          <ul className="mt-1 divide-y divide-line text-sm">
            {upcoming.map((u) => (
              <ComingUpRow key={u.key} item={{ key: u.key, merchant: u.merchant, expectedOn: u.expectedOn, cents: u.cents, lastOn: u.lastOn, years: u.years }} />
            ))}
          </ul>
        </Card>
      ) : null}

      {managed.length ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">Managed for others</h2>
            <span className="text-xs text-muted">Kept out of your spending and income</span>
          </div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {managed.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <Link href={`/transactions?category=${x.id}`} className="font-semibold hover:underline">
                    {x.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    This month: {exact(x.monthInCents)} collected · {exact(x.monthOutCents)} paid out
                  </span>
                </span>
                <span className="text-right">
                  <span className="tnum block font-bold">{exact(Math.abs(x.heldCents))}</span>
                  <span className="text-xs text-muted">{x.heldCents >= 0 ? "held for others, all time" : "fronted by you, all time"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
