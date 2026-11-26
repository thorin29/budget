import { requireDevice } from "@/server/device-auth";
import { unlinkPayback } from "@/server/owed";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Unties a payment from charges and takes it out of the person's name. Body: { txnId }. */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const b = (await readJson(request)) as Record<string, unknown>;
    if (typeof b.txnId !== "string") throw new ValidationError({ txnId: ["A transaction id"] });
    await unlinkPayback(b.txnId);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
