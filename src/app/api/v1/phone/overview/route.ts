import { requireDevice } from "@/server/device-auth";
import { phoneOverview } from "@/server/phone";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** The phone's Insights overview: income vs expenses, the outlook, last month and debt. `?month=YYYY-MM` for an earlier month. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const m = /^(\d{4})-(\d{2})$/.exec(new URL(request.url).searchParams.get("month") ?? "");
    const month = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : undefined;
    return ok(await phoneOverview(month ? Number(m![1]) : undefined, month));
  } catch (error) {
    return fail(error);
  }
}
