import { requireDevice } from "@/server/device-auth";
import { linkPayback } from "@/server/owed";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Ties a payment back to charges. Body: { personId, txnId, chargeKeys: string[] }. */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const b = (await readJson(request)) as Record<string, unknown>;
    if (typeof b.personId !== "string" || typeof b.txnId !== "string" || !Array.isArray(b.chargeKeys) || b.chargeKeys.some((k) => typeof k !== "string"))
      throw new ValidationError({ body: ["personId, txnId and chargeKeys are needed"] });
    await linkPayback(b.personId, b.txnId, b.chargeKeys as string[]);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
