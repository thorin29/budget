import { requireDevice } from "@/server/device-auth";
import { addChargeAsBill } from "@/server/bill-from-charge";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** "Add as a bill": a monthly bill made from a charge. Body: { transactionId, name? } */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const b = (await readJson(request)) as Record<string, unknown>;
    if (typeof b.transactionId !== "string") throw new ValidationError({ transactionId: ["Required"] });
    return ok({ added: true, ...(await addChargeAsBill(b.transactionId, typeof b.name === "string" ? b.name : undefined)) });
  } catch (error) {
    return fail(error);
  }
}
