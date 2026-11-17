import { requireDevice } from "@/server/device-auth";
import { getEnvelopes } from "@/server/envelopes";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Spending envelopes for the pay period in progress. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    return ok(await getEnvelopes());
  } catch (error) {
    return fail(error);
  }
}
