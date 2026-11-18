import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { getCashTiming } from "@/server/cash-timing";
import { CashTimingCard } from "../cash-timing";
import { TabHeading } from "../shared";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const plan = await getMonthPlan().catch(() => null);
  const cash = await getCashTiming(plan?.debt.cents ?? 0).catch((error: unknown) => (console.error("Cash timing:", error), null));
  return (
    <div className="space-y-6">
      <InsightsTabs />
      <TabHeading
        title="Cash"
        description="Whether checking covers every bill and full card payment on its due date, through next month, and what each paycheck has to pay."
      />
      {cash ? <CashTimingCard cash={cash} /> : null}
    </div>
  );
}
