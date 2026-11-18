import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { getDebt } from "@/server/debt";
import { debtChart } from "@/server/plan-charts";
import { Card } from "@/components/ui";
import { DebtChartCard } from "../plan-charts";
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
  return (
    <div className="space-y-6">
      <InsightsTabs />
      <TabHeading title="Debt" description="Everything owed: loans paid down to zero, and the credit cards. Balances come from the bank where it shows them." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm font-semibold text-muted">Total owed</p>
          <p className="tnum mt-1 text-3xl font-bold">{money(debt.totalCents)}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-muted">Loans (installment)</p>
          <p className="tnum mt-1 text-3xl font-bold">{money(debt.installmentCents)}</p>
          <p className="mt-1 text-xs text-muted">A set balance, paid down to zero</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-muted">Cards (revolving)</p>
          <p className="tnum mt-1 text-3xl font-bold">{money(debt.revolvingCents)}</p>
          <p className="mt-1 text-xs text-muted">{fees ? `${exact(fees)} in interest and fees this year` : "No interest or fees this year"}</p>
        </Card>
      </div>

      <Card>
        <h2 className="text-base font-bold">Loans</h2>
        <p className="mt-0.5 text-xs text-muted">With the interest rate, the payoff date counts interest. A balance you typed counts down by the payments recorded since; update it now and then for a loan with interest.</p>
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
                    <td className="py-2.5 pr-3">
                      <span className="font-semibold">{d.name}</span>
                      <span className="block text-xs text-muted">
                        {d.kind === "zero" ? `0% until ${day(d.endsOn!)}, ${d.endsOn!.slice(0, 4)}` : d.source === "bank" ? "Balance from the bank" : d.asOf ? `Balance as of ${day(d.asOf)}, less payments since` : ""}
                        {d.interestLeftCents ? ` · about ${money(d.interestLeftCents)} interest to go` : ""}
                      </span>
                      {d.kind === "bill" && d.aprBps === null ? <LoanForm id={d.id} balance={false} /> : null}
                    </td>
                    <td className="tnum py-2.5 pr-3 text-right font-semibold">{money(d.balanceCents)}</td>
                    <td className="tnum py-2.5 pr-3 text-right">{money(d.paymentCents)}/mo</td>
                    <td className="tnum py-2.5 pr-3 text-right">{d.aprBps === null ? <span className="text-muted">?</span> : pct(d.aprBps)}</td>
                    <td className={`py-2.5 text-right ${d.neverEnds || (d.endsOn && d.lastMonth && d.lastMonth > d.endsOn.slice(0, 7)) ? "text-danger" : ""}`}>
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
      </Card>

      {debt.needsDetails.length ? (
        <Card>
          <h2 className="text-base font-bold">Loans missing a balance</h2>
          <p className="mt-0.5 text-xs text-muted">
            These bills look like loans. Enter what&rsquo;s left to pay and the interest rate (APR) from the lender&rsquo;s statement or website, and the payoff date is
            worked out. A loan account linked from the bank keeps its own balance: set that on the bill in{" "}
            <Link href="/line-items" className="font-semibold text-accent-text hover:underline">Bills &amp; income</Link>.
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

      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="text-base font-bold">Credit cards</h2>
        <p className="mt-0.5 text-xs text-muted">Revolving debt: the balance moves with spending and payments. Paid in full means this statement is paid, so no interest is charged.</p>
        <ul className="mt-2 divide-y divide-line">
          {debt.revolving.map((c) => (
            <li key={c.id} className="py-2.5">
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

      {chart ? <DebtChartCard debt={chart} /> : null}
      </div>
    </div>
  );
}
