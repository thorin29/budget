import { requireDevice } from "@/server/device-auth";
import { unsplitAmazonCharges } from "@/server/amazon-sync";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Amazon card charges from the last 120 days that aren't split yet, oldest first:
 * `{ charges: [{ date, cents, last4 }] }` (at most 300). The extension reads only the Amazon
 * orders these could belong to, and stops once they're found.
 */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    return ok({ charges: await unsplitAmazonCharges() });
  } catch (error) {
    return fail(error);
  }
}
