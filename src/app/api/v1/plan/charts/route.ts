import { requireDevice } from "@/server/device-auth";
import { getMonthPlan } from "@/server/month-plan";
import { debtChart, planHistory } from "@/server/plan-charts";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** The plan's multi-month charts: recent months against their money, and the 0% balance. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const plan = await getMonthPlan();
    const [history, debt] = await Promise.all([planHistory(plan), debtChart(plan.today, plan.debt.cents, plan.debt.targetCents)]);
    return ok({ history, debt });
  } catch (error) {
    return fail(error);
  }
}
