import { requireDevice } from "@/server/device-auth";
import { getMonthPlan } from "@/server/month-plan";
import { getCashTiming } from "@/server/cash-timing";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Cash timing: checking through the rest of this month and next, with each paycheck's payments. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const plan = await getMonthPlan();
    return ok(await getCashTiming(plan.debt.cents));
  } catch (error) {
    return fail(error);
  }
}
