import Link from "next/link";
import type { ReactNode } from "react";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan, type PlanBill, type PlanGroup } from "@/server/month-plan";
import { SUBSCRIPTIONS, unbilledRepeats } from "@/server/subscriptions";
import { getUpcoming } from "@/server/yearly";
import { getInsights } from "@/server/insights";
import { Card } from "@/components/ui";
import { Txns } from "../month-plan";
import { ComingUpRow } from "../coming-up";
import { MonthPicker, TabHeading, pickMonth } from "../shared";
import { RepeatActions } from "./repeat-actions";

export const dynamic = "force-dynamic";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const exact = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-ok-soft text-ok" },
  due: { label: "Due", cls: "bg-neutral-soft text-muted ring-1 ring-line" },
  overdue: { label: "Overdue", cls: "bg-danger-soft text-danger" },
  skipped: { label: "Not this month", cls: "bg-neutral-soft text-muted" },
};

/** A line of money out that opens to what's in it. */
function OutRow({ title, cents, note, children, open = false }: { title: string; cents: number; note?: string; children?: ReactNode; open?: boolean }) {
  const head = (
    <span className="flex items-baseline justify-between gap-3">
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${children ? "group-open:underline" : ""}`}>{title}</span>
        {note ? <span className="block text-xs text-muted">{note}</span> : null}
      </span>
      <span className="tnum shrink-0 text-sm font-semibold">{money(cents)}</span>
    </span>
  );
  if (!children) return <li className="py-2.5">{head}</li>;
  return (
    <li className="py-2.5">
      <details className="group" open={open}>
        <summary className="cursor-pointer list-none">{head}</summary>
        <div className="mt-2 rounded-xl bg-neutral-soft px-3 py-2">{children}</div>
      </details>
    </li>
  );
}

function BillList({ rows }: { rows: PlanBill[] }) {
  if (!rows.length) return <p className="text-xs text-muted">None this month.</p>;
  return (
    <ul className="divide-y divide-line text-xs">
      {rows.map((b) => (
        <li key={`${b.lineItemId}:${b.dueOn}`} className="flex items-center justify-between gap-3 py-1">
          <span className="min-w-0 truncate">
            <span className="tnum text-muted">{day(b.dueOn)}</span> {b.name}
            {b.from ? <span className="text-muted"> · from an earlier month</span> : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
            <span className="tnum">{exact(b.cents)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const KINDS: Array<{ tier: PlanGroup["tier"]; label: string }> = [
  { tier: "ESSENTIAL", label: "Essentials" },
  { tier: "FLEXIBLE", label: "Extras" },
  { tier: "UNPLANNED", label: "Unplanned" },
  { tier: "SORT", label: "Needs sorting" },
];

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const picked = pickMonth(m);
  const [plan, repeats, upcoming, insights] = await Promise.all([
    getMonthPlan(picked.year, picked.month),
    picked.isNow ? unbilledRepeats().catch(() => []) : Promise.resolve([]),
    picked.isNow ? getUpcoming().catch(() => []) : Promise.resolve([]),
    getInsights(picked.year, picked.month).catch(() => null),
  ]);
  const isSub = (b: PlanBill) => (b.category ?? "").toLowerCase() === SUBSCRIPTIONS.toLowerCase();
  const bills = plan.bills.items.filter((b) => !isSub(b));
  const subs = plan.bills.items.filter(isSub);
  const sum = (rows: PlanBill[]) => rows.reduce((t, b) => t + b.cents, 0);
  const paid = (rows: PlanBill[]) => rows.filter((b) => b.status === "paid").reduce((t, b) => t + b.cents, 0);
  const outTotal = plan.bills.totalCents + plan.debt.cents + plan.spentCents;
  const net = plan.income.totalCents - outTotal;
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
            <OutRow title="Bills" cents={sum(bills)} note={`${money(paid(bills))} paid${bills.some((b) => b.status === "overdue") ? " · some overdue" : ""}`}>
              <BillList rows={bills} />
            </OutRow>
            <OutRow
              title={SUBSCRIPTIONS}
              cents={sum(subs)}
              note={`${subs.length} bill${subs.length === 1 ? "" : "s"}${repeats.length ? ` · ${repeats.length} more repeating in the bank` : ""}`}
              open={repeats.length > 0}
            >
              <BillList rows={subs} />
              {repeats.length ? (
                <>
                  <p className="mt-2 text-xs font-semibold">Repeating charges that aren&rsquo;t bills yet</p>
                  <p className="text-xs text-muted">Charges that come every month on their own. Make each one a bill so it&rsquo;s planned, or cancel what you don&rsquo;t use.</p>
                  <ul className="mt-1 divide-y divide-line text-xs">
                    {repeats.map((r) => (
                      <li key={r.merchantKey} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span className="min-w-0 truncate">
                          {r.merchant} <span className="text-muted">· about {exact(r.typicalCents)} around day {r.typicalDay} · {r.months} months · {r.account}</span>
                        </span>
                        <RepeatActions merchantKey={r.merchantKey} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </OutRow>
            {plan.debt.cents > 0 ? (
              <OutRow title={`Debt payment${plan.debt.name ? `: ${plan.debt.name}` : ""}`} cents={plan.debt.cents} note={plan.debt.source === "paid" ? "Paid" : plan.debt.dueOn ? `Due ${day(plan.debt.dueOn)}` : undefined} />
            ) : null}
            {plan.bills.other.length ? (
              <OutRow title="Bill-category charges not on the bill list" cents={plan.bills.otherCents}>
                <Txns rows={plan.bills.other} />
              </OutRow>
            ) : null}
            <OutRow title="Everyday spending" cents={plan.spentCents} note="Essentials, Extras and Unplanned, by transaction date">
              <div className="space-y-2">
                {KINDS.map(({ tier, label }) => {
                  const groups = plan.groups.filter((g) => g.tier === tier && g.spentCents !== 0);
                  if (!groups.length) return null;
                  return (
                    <div key={tier}>
                      <p className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-muted">
                        <span>{label}</span>
                        <span className="tnum">{exact(groups.reduce((t, g) => t + g.spentCents, 0))}</span>
                      </p>
                      {groups.map((g) => (
                        <details key={g.id} className="group/g">
                          <summary className="flex cursor-pointer list-none justify-between gap-3 py-0.5 text-xs font-semibold">
                            <span className="group-open/g:underline">{g.name}</span>
                            <span className="tnum">{exact(g.spentCents)}</span>
                          </summary>
                          <div className="pl-3">
                            {g.categories.map((c) => (
                              <details key={c.id ?? "none"} className="group/c">
                                <summary className="flex cursor-pointer list-none justify-between gap-3 py-0.5 text-xs">
                                  <span className="group-open/c:underline">{c.name}</span>
                                  <span className="tnum">{exact(c.spentCents)}</span>
                                </summary>
                                <div className="pl-3">
                                  <Txns rows={c.transactions} />
                                </div>
                              </details>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  );
                })}
              </div>
            </OutRow>
          </ul>
        </Card>
      </div>

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
