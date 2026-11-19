import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { getCashTiming } from "@/server/cash-timing";
import { cushionSetting } from "@/server/envelopes";
import { cushion as cushionOf, forecastTotals } from "@/lib/budget-forecast";
import { planForecastRows } from "@/server/plan-charts";
import { carryOver } from "../plan-charts";
import { ForecastCards, ForecastTable } from "./forecast";
import { MonthPicker, TabHeading, pickMonth } from "../shared";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const picked = pickMonth(m);
  const plan = await getMonthPlan(picked.year, picked.month).catch((error: unknown) => (console.error("Month plan:", error), null));
  const current = !!plan && !plan.closed && plan.month === plan.today.slice(0, 7);
  const [cash, minimum] = await Promise.all([current ? getCashTiming(plan!.debt.cents).catch(() => null) : null, cushionSetting()]);

  const view = plan
    ? (() => {
        const rows = planForecastRows(plan);
        const totals = forecastTotals(rows);
        const [y, mo] = [Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7))];
        const monthEnd = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
        const monthStart = `${plan.month}-01`;
        const nextMonthStart = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
        const nextMonthName = new Date(Date.UTC(y, mo, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
        let cushion = null;
        if (current && cash?.check) {
          const carry = carryOver(plan, cash.check);
          const left = rows.filter((r) => r.tier === "ESSENTIAL" || r.tier === "FLEXIBLE").reduce((t, r) => t + Math.max(0, r.forecastCents - r.spentCents), 0);
          const net = plan.income.totalCents - plan.bills.totalCents - plan.debt.cents - totals.forecastCents;
          cushion = cushionOf(carry.nowCents, left, net, minimum);
        }
        return { rows, totals, monthEnd, monthStart, nextMonthStart, nextMonthName, cushion };
      })()
    : null;

  return (
    <div className="space-y-4">
      <InsightsTabs right={<MonthPicker {...{ path: "/insights/budget", year: picked.year, month: picked.month }} />} />
      <TabHeading title="Budget" />
      {plan && view ? (
        <>
          <ForecastCards
            totals={view.totals}
            cushion={view.cushion}
            minimumCents={minimum}
            monthEnd={view.monthEnd}
            monthStart={view.monthStart}
            nextMonthStart={view.nextMonthStart}
            nextMonthName={view.nextMonthName}
            closed={plan.closed}
          />
          <ForecastTable
            rows={view.rows}
            totals={view.totals}
            bills={{ billsCents: plan.bills.listCents, billsPaidCents: plan.bills.listPaidCents, debtCents: plan.debt.cents, debtPaidCents: plan.debt.source === "paid" ? plan.debt.cents : 0, otherCents: plan.bills.otherCents }}
            monthEnd={view.monthEnd}
            closed={plan.closed}
          />
        </>
      ) : null}
    </div>
  );
}
