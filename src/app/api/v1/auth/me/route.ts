import { requireDevice } from "@/server/device-auth";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Who this token belongs to. The phone calls it to confirm a 401 before
 * throwing its enrolment away, so one bad response doesn't sign it out.
 */
export async function GET(request: Request) {
  try {
    const { user, device } = await requireDevice(request);
    return ok({ user, device });
  } catch (error) {
    return fail(error);
  }
}
