import Link from "next/link";
import { getEnvelopeSetup } from "@/server/envelopes";
import { getMonthPlan } from "@/server/month-plan";
import { PageHeading } from "@/components/ui";
import { InsightsTabs } from "@/components/insights-tabs";
import { EnvelopeSetupForm } from "./setup";

export const dynamic = "force-dynamic";

export default async function EnvelopeSetupPage() {
  const [setup, plan] = await Promise.all([getEnvelopeSetup(), getMonthPlan()]);
  return (
    <div className="space-y-6">
      <InsightsTabs active="spending" />
      <PageHeading
        title="Set up the spending plan"
        description="A budget is a group of categories. Bills come off the top; essentials and extras get a monthly guardrail; unplanned costs come out of the month when they happen."
        action={
          <Link href="/insights" className="text-sm font-semibold text-accent-text hover:underline">
            ‹ Back to Insights
          </Link>
        }
      />
      <EnvelopeSetupForm
        setup={setup}
        debt={{ cents: plan.debt.cents, automatic: plan.debt.source !== "set", targetCents: plan.debt.targetCents }}
      />
    </div>
  );
}
