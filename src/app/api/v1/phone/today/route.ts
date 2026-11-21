import { requireDevice } from "@/server/device-auth";
import { phoneToday } from "@/server/phone";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** The phone's Today tab: available to spend on the main card's statement, checking, what needs you, the next bills. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    return ok(await phoneToday());
  } catch (error) {
    return fail(error);
  }
}
