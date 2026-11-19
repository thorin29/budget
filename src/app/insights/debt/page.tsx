import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { getDebt } from "@/server/debt";
import { debtChart } from "@/server/plan-charts";
import { Card } from "@/components/ui";
import { LoanPanel, ZeroPanel } from "../plan-charts";
import { PayoffSwitcher } from "./payoff-switcher";
import { payoffSchedule } from "@/lib/payoff";
import { TabHeading } from "../shared";
import { LoanForm } from "./loan-form";

export const dynamic = "force-dynamic";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const exact = (cents: number) => `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthYear = (ym: string) => new Date(`${ym.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;

export default async function DebtPage() {
  const plan = await getMonthPlan().catch(() => null);
  const debtCents = plan?.debt.cents ?? 0;
  const [debt, chart] = await Promise.all([getDebt(debtCents), plan ? debtChart(plan.today, debtCents, plan.debt.targetCents).catch(() => null) : null]);
  const fees = debt.revolving.reduce((t, c) => t + c.interestFeesCents, 0);
  const firstWord = (n: string) => n.toLowerCase().match(/[a-z0-9]+/)?.[0] ?? n;
  const bills = debt.installment.filter((d) => d.kind === "bill");
  const twins = bills.flatMap((d, i) => bills.slice(i + 1).filter((e) => e.paymentCents === d.paymentCents && firstWord(e.name) === firstWord(d.name)).map((e) => [d, e] as const));
  const today = debt.today;
  const short = (n: string) => n.replace(/\s*\(.*?\)\s*/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");
  const tabs = debt.installment.flatMap((d) => {
    if (d.kind === "zero") return chart ? [{ key: d.id, label: short(d.name), panel: <ZeroPanel debt={chart} /> }] : [];
    return [{
      key: d.id,
      label: short(d.name),
      panel: <LoanPanel name={d.name} balanceCents={d.balanceCents} paymentCents={d.paymentCents} aprBps={d.aprBps} interestLeftCents={d.interestLeftCents} schedule={payoffSchedule(d.balanceCents, d.paymentCents, d.aprBps, today)} />,
    }];
  });
  // The 0% balance first: it's the one with a deadline.
  tabs.sort((x, y) => Number(debt.installment.find((d) => d.id === y.key)?.kind === "zero") - Number(debt.installment.find((d) => d.id === x.key)?.kind === "zero"));
  return (
    <div className="space-y-4">
      <InsightsTabs />
      <TabHeading title="Debt" />

      <Card>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-muted">Total owed</dt>
            <dd className="tnum text-2xl font-bold">{money(debt.totalCents)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Loans (installment)</dt>
            <dd className="tnum text-2xl font-bold">{money(debt.installmentCents)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Cards (revolving)</dt>
            <dd className="tnum text-2xl font-bold">
              {money(debt.revolvingCents)} <span className={`text-xs font-semibold ${fees ? "text-danger" : "text-muted"}`}>{fees ? `${exact(fees)} interest and fees this year` : "no interest or fees this year"}</span>
            </dd>
          </div>
        </dl>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="space-y-4">
      <Card>
        <h2 className="text-base font-bold">Loans</h2>
        {debt.installment.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3">Loan</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                  <th className="py-2 pr-3 text-right">Payment</th>
                  <th className="py-2 pr-3 text-right">Rate</th>
                  <th className="py-2 text-right">Paid off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {debt.installment.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="py-2 pr-3">
                      <span className="font-semibold">{d.name}</span>
                      <span className="block text-xs text-muted">
                        {d.kind === "zero" ? `0% until ${day(d.endsOn!)}, ${d.endsOn!.slice(0, 4)}` : d.source === "bank" ? "Balance from the bank" : d.asOf ? `Balance as of ${day(d.asOf)}, less payments since` : ""}
                        {d.interestLeftCents ? ` · about ${money(d.interestLeftCents)} interest to go` : ""}
                      </span>
                      {d.kind === "bill" && d.aprBps === null ? <LoanForm id={d.id} balance={false} /> : null}
                    </td>
                    <td className="tnum py-2 pr-3 text-right font-semibold">{money(d.balanceCents)}</td>
                    <td className="tnum py-2 pr-3 text-right">{money(d.paymentCents)}/mo</td>
                    <td className="tnum py-2 pr-3 text-right">{d.aprBps === null ? <span className="text-muted">?</span> : pct(d.aprBps)}</td>
                    <td className={`py-2 text-right ${d.neverEnds || (d.endsOn && d.lastMonth && d.lastMonth > d.endsOn.slice(0, 7)) ? "text-danger" : ""}`}>
                      {d.neverEnds ? "Never: the payment is below the interest" : d.lastMonth ? monthYear(d.lastMonth) : "—"}
                      {d.paymentsLeft ? <span className="block text-xs text-muted">{d.paymentsLeft} payments</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No loans with a balance yet.</p>
        )}
        {twins.map(([x, y]) => (
          <p key={`${x.id}-${y.id}`} className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
            <b>{x.name}</b> and <b>{y.name}</b> both pay {money(x.paymentCents)} a month. If they&rsquo;re the same loan, delete one in{" "}
            <Link href="/line-items" className="font-semibold underline">Bill setup</Link> so its payment isn&rsquo;t counted twice.
          </p>
        ))}
      </Card>

      {debt.needsDetails.length ? (
        <Card>
          <h2 className="text-base font-bold">Loans missing a balance</h2>
          <p className="mt-0.5 text-xs text-muted">
            These bills look like loans. Enter what&rsquo;s left to pay and the interest rate (APR) from the lender&rsquo;s statement or website, and the payoff date is
            worked out. A loan account linked from the bank keeps its own balance: set that on the bill in{" "}
            <Link href="/line-items" className="font-semibold text-accent-text hover:underline">Bill setup</Link>.
          </p>
          <ul className="mt-2 divide-y divide-line">
            {debt.needsDetails.map((l) => (
              <li key={l.lineItemId} className="py-2.5">
                <span className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{l.name}</span>
                  <span className="tnum text-muted">{money(l.paymentCents)}/mo{l.category ? ` · ${l.category}` : ""}</span>
                </span>
                <LoanForm id={l.lineItemId} askNotLoan />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-base font-bold">Credit cards</h2>
        <ul className="mt-2 divide-y divide-line">
          {debt.revolving.map((c) => (
            <li key={c.id} className="py-2">
              <details className="group">
                <summary className="cursor-pointer list-none">
                  <span className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold group-open:underline">{c.name}</span>
                    <span className="tnum font-semibold">{money(c.balanceCents)} owed</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {c.status === "paid" ? <span className="rounded-full bg-ok-soft px-2 py-0.5 font-bold text-ok">Statement paid</span> : null}
                    {c.status === "due" ? (
                      <span className="rounded-full bg-warn-soft px-2 py-0.5 font-bold text-warn">
                        {exact(c.dueCents ?? 0)} due {c.dueOn ? day(c.dueOn) : ""}
                      </span>
                    ) : null}
                    {c.status === "none" ? <span className="rounded-full bg-neutral-soft px-2 py-0.5 font-bold text-muted">Nothing owed</span> : null}
                    {c.status === "unknown" ? <span className="text-muted">Set its statement and due days on Accounts to see what&rsquo;s due</span> : null}
                    <span className={c.interestFeesCents ? "text-danger" : "text-muted"}>
                      {c.interestFeesCents ? `${exact(c.interestFeesCents)} interest and fees this year` : "No interest or fees this year"}
                    </span>
                  </span>
                </summary>
                {c.interestFees.length ? (
                  <ul className="mt-2 divide-y divide-line rounded-xl bg-neutral-soft px-3 py-1 text-xs">
                    {c.interestFees.map((f, i) => (
                      <li key={`${f.date}:${i}`} className="flex justify-between gap-3 py-1">
                        <span className="truncate">
                          <span className="tnum text-muted">{day(f.date)}</span> {f.name}
                        </span>
                        <span className="tnum">{exact(f.cents)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
      </Card>

      </div>
      {tabs.length ? <PayoffSwitcher tabs={tabs} /> : null}
      </div>
    </div>
  );
}
