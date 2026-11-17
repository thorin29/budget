import { requireDevice } from "@/server/device-auth";
import { getMonthPlan } from "@/server/month-plan";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** The month's spending plan. `?month=YYYY-MM` for an earlier month; this month by default. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const m = /^(\d{4})-(\d{2})$/.exec(new URL(request.url).searchParams.get("month") ?? "");
    const year = m ? Number(m[1]) : undefined;
    const month = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : undefined;
    return ok(await getMonthPlan(month ? year : undefined, month));
  } catch (error) {
    return fail(error);
  }
}
