import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { cushionSetting, getEnvelopeSetup } from "@/server/envelopes";
import { getMonthPlan } from "@/server/month-plan";
import { Card } from "@/components/ui";
import { Limits } from "../month-plan";
import { EnvelopeSetupForm } from "../envelopes/setup";
import { TabHeading } from "../shared";

export const dynamic = "force-dynamic";

export default async function InsightsSettingsPage() {
  const [setup, plan, cushion] = await Promise.all([getEnvelopeSetup(), getMonthPlan(), cushionSetting()]);
  return (
    <div className="space-y-6">
      <InsightsTabs />
      <TabHeading title="Settings" />
      <Limits plan={plan} />
      <EnvelopeSetupForm setup={setup} debt={{ cents: plan.debt.cents, automatic: plan.debt.source !== "set", targetCents: plan.debt.targetCents }} cushionCents={cushion} />
      <Card>
        <h2 className="text-base font-bold">Elsewhere</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <Link href="/line-items" className="font-semibold text-accent-text hover:underline">Bill setup</Link>{" "}
            <span className="text-muted">· every bill and paycheck, schedules, and loan balances</span>
          </li>
          <li>
            <Link href="/settings/categories" className="font-semibold text-accent-text hover:underline">Categories</Link>{" "}
            <span className="text-muted">· including money managed for others, like league fees</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
