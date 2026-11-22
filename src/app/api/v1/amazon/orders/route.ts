import { requireDevice } from "@/server/device-auth";
import { idempotent } from "@/server/idempotency";
import { syncAmazonOrders } from "@/server/amazon-sync";
import { readOrders } from "@/lib/amazon-sync";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/**
 * Orders the Amazon extension read: `{ orders: [{ orderId, orderDate, items: [{ name, cents,
 * quantity, shipmentKey, shipDate, productId?, category? }], charges: [{ date, cents, last4 }] }] }`, at most 50.
 * Splits matching Amazon card charges that aren't split yet; sending the same orders again
 * changes nothing. Answers `{ matched, split, waiting, waitingSince, noMatch, noChargeList, done }`: counts, and
 * `done` as positions in the batch, never order numbers.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireDevice(request);
    return await idempotent(request, auth, async () => {
      const read = readOrders(await readJson(request));
      if ("issues" in read) throw new ValidationError(read.issues);
      return ok(await syncAmazonOrders(read.orders));
    });
  } catch (error) {
    return fail(error);
  }
}
