import Link from "next/link";
import { getEnvelopeSetup, getEnvelopes } from "@/server/envelopes";
import { PageHeading } from "@/components/ui";
import { InsightsTabs } from "@/components/insights-tabs";
import { EnvelopeSetupForm } from "./setup";

export const dynamic = "force-dynamic";

export default async function EnvelopeSetupPage() {
  const [setup, view] = await Promise.all([getEnvelopeSetup(), getEnvelopes()]);
  return (
    <div className="space-y-6">
      <InsightsTabs active="spending" />
      <PageHeading
        title="Set up envelopes"
        description="An envelope is a group of categories with one limit. Essentials are protected, planned spending is set aside, and flexible envelopes share one pot."
        action={
          <Link href="/insights" className="text-sm font-semibold text-accent-text hover:underline">
            ‹ Back to Insights
          </Link>
        }
      />
      <EnvelopeSetupForm
        setup={setup}
        debt={{ cents: view.debt.perPeriodCents, automatic: view.debt.automatic, neededCents: view.debt.neededCents, byPayday: view.period.byPayday }}
      />
    </div>
  );
}
