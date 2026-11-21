import { requireDevice } from "@/server/device-auth";
import { phoneAlerts } from "@/server/phone";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Everything that could notify right now, each with a stable key. The phone keeps the kinds it's set to and posts each key once. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    return ok({ alerts: await phoneAlerts() });
  } catch (error) {
    return fail(error);
  }
}
