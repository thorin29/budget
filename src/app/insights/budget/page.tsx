import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { getCashTiming } from "@/server/cash-timing";
import { cushionSetting } from "@/server/envelopes";
import { cushion as cushionOf, forecastGroups, forecastTotals } from "@/lib/budget-forecast";
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
        const rows = forecastGroups(
          plan.groups.map((g) => ({
            id: g.id,
            name: g.name,
            tier: g.tier,
            spentCents: g.spentCents,
            limitCents: g.limitCents,
            usualCents: g.usualCents,
            charges: g.categories.reduce((t, c) => t + c.transactions.length, 0),
          })),
          Number(plan.today.slice(8, 10)),
          plan.daysInMonth,
          plan.closed,
        );
        const totals = forecastTotals(rows);
        const [y, mo] = [Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7))];
        const monthEnd = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
        const nextMonth = new Date(Date.UTC(y, mo, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
        let cushion = null;
        if (current && cash?.check) {
          const carry = carryOver(plan, cash.check);
          const left = rows.filter((r) => r.tier === "ESSENTIAL" || r.tier === "FLEXIBLE").reduce((t, r) => t + Math.max(0, r.forecastCents - r.spentCents), 0);
          const net = plan.income.totalCents - plan.bills.totalCents - plan.debt.cents - totals.forecastCents;
          cushion = cushionOf(carry.nowCents, left, net, minimum);
        }
        return { rows, totals, monthEnd, nextMonth, cushion };
      })()
    : null;

  return (
    <div className="space-y-4">
      <InsightsTabs right={<MonthPicker {...{ path: "/insights/budget", year: picked.year, month: picked.month }} />} />
      <TabHeading title="Budget" />
      {plan && view ? (
        <>
          <ForecastCards totals={view.totals} cushion={view.cushion} minimumCents={minimum} monthEnd={view.monthEnd} nextMonth={view.nextMonth} closed={plan.closed} />
          <ForecastTable rows={view.rows} totals={view.totals} monthEnd={view.monthEnd} closed={plan.closed} />
        </>
      ) : null}
    </div>
  );
}
