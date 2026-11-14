import { refreshDevice, requireDevice } from "@/server/device-auth";
import { RateLimitedError, fail, ok } from "@/server/http";
import { limits } from "@/server/limits";

export const dynamic = "force-dynamic";

/** A fresh token for this device; the old one stops working at once. */
export async function POST(request: Request) {
  try {
    const auth = await requireDevice(request);
    const key = `device:${auth.device.id}`;
    if (!limits.refreshByDevice.hit(key)) throw new RateLimitedError(limits.refreshByDevice.retryAfter(key));
    return ok(await refreshDevice(auth));
  } catch (error) {
    return fail(error);
  }
}
