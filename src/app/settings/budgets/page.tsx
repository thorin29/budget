import { SectionHeading } from "@/components/ui";
import { allCategories, categoryUsage, getEnvelopeSetup } from "@/server/envelopes";
import { getMonthPlan } from "@/server/month-plan";
import { BudgetsPanel, type SetupBudget } from "../../insights/settings/setup-panel";

export const dynamic = "force-dynamic";

/** Settings › Budgets & categories: the one place budgets and categories are set. */
export default async function BudgetsSettings({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await searchParams;
  const [setup, plan, everyCategory] = await Promise.all([getEnvelopeSetup(), getMonthPlan(), allCategories()]);
  const usage = await categoryUsage(setup.ungrouped.map((c) => c.id)).catch(() => ({}));
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
      <SectionHeading title="Budgets" />
      <BudgetsPanel budgets={budgets} ungrouped={setup.ungrouped} usage={usage} initial={item} categories={everyCategory} />
    </div>
  );
}
