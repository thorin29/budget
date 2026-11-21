import { requireDevice } from "@/server/device-auth";
import { phoneBudget } from "@/server/phone";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** The phone's Budget view. `?view=month|cards|<card id>`, `?month=YYYY-MM` for an earlier month (month and by card only). */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const q = new URL(request.url).searchParams;
    const m = /^(\d{4})-(\d{2})$/.exec(q.get("month") ?? "");
    const month = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : undefined;
    const view = (q.get("view") ?? "month").slice(0, 64);
    return ok(await phoneBudget(view, month ? Number(m![1]) : undefined, month));
  } catch (error) {
    return fail(error);
  }
}
