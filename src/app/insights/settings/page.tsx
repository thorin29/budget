import { InsightsTabs } from "@/components/insights-tabs";
import { cushionSetting, getEnvelopeSetup } from "@/server/envelopes";
import { getMonthPlan } from "@/server/month-plan";
import { homeValue } from "@/server/home-value";
import { TabHeading } from "../shared";
import { SetupPanel, type SetupBudget } from "./setup-panel";

export const dynamic = "force-dynamic";

export default async function InsightsSettingsPage() {
  const [setup, plan, cushion, home] = await Promise.all([getEnvelopeSetup(), getMonthPlan(), cushionSetting(), homeValue().catch(() => null)]);
  const byId = new Map(plan.groups.map((g) => [g.id, g]));
  const budgets: SetupBudget[] = setup.groups.map((g) => ({
    id: g.id,
    name: g.name,
    tier: g.tier as SetupBudget["tier"],
    limitCents: g.limitCents,
    usualCents: byId.get(g.id)?.usualCents ?? null,
    spentCents: byId.get(g.id)?.spentCents ?? null,
    categories: g.categories,
  }));
  return (
    <div className="space-y-4">
      <InsightsTabs />
      <TabHeading title="Setup" />
      <SetupPanel budgets={budgets} ungrouped={setup.ungrouped} debt={{ cents: plan.debt.cents, automatic: plan.debt.source !== "set", targetCents: plan.debt.targetCents }} cushionCents={cushion} home={home} />
    </div>
  );
}
