import { requireDevice } from "@/server/device-auth";
import { dismissMatch } from "@/server/owed";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** "Not this": stops suggesting a payment for a person. Body: { personId, txnId }. */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const b = (await readJson(request)) as Record<string, unknown>;
    if (typeof b.personId !== "string" || typeof b.txnId !== "string") throw new ValidationError({ body: ["personId and txnId are needed"] });
    await dismissMatch(b.personId, b.txnId);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
