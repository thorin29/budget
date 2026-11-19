import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { PlanHero, TierCards } from "../month-plan";
import { PaceChart } from "../plan-charts";
import { MonthPicker, TabHeading, pickMonth } from "../shared";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const picked = pickMonth(m);
  const plan = await getMonthPlan(picked.year, picked.month).catch((error: unknown) => (console.error("Month plan:", error), null));
  return (
    <div className="space-y-6">
      <InsightsTabs right={<MonthPicker {...{ path: "/insights/budget", year: picked.year, month: picked.month }} />} />
      <TabHeading title="Budget" />
      {plan ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <PlanHero plan={plan} />
            <PaceChart plan={plan} />
          </div>
          <TierCards plan={plan} />
          <p className="text-xs text-muted">
            Change limits and which categories go in which budget on{" "}
            <Link href="/insights/settings" className="font-semibold text-accent-text hover:underline">
              Settings
            </Link>
            .
          </p>
        </>
      ) : null}
    </div>
  );
}
