import { requireDevice } from "@/server/device-auth";
import { amazonSyncStatus } from "@/server/amazon-sync";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * The Amazon extension's popup: last sync, charges split this month, orders waiting, and
 * `syncFrom`, the day its next sync starts (a week before the newest split Amazon charge).
 */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    return ok(await amazonSyncStatus());
  } catch (error) {
    return fail(error);
  }
}
