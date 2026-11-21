import { requireDevice } from "@/server/device-auth";
import { getTrackerMonth } from "@/server/tracker-month";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  try {
    await requireDevice(request);
    const { year, month } = await params;
    return ok(await getTrackerMonth(Number(year), Number(month)));
  } catch (error) {
    return fail(error);
  }
}
