import { requireDevice } from "@/server/device-auth";
import { dismissMatch } from "@/server/review";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** "Not this": the charge isn't offered for that bill again. Body: { lineItemId, txnId } */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const b = (await readJson(request)) as Record<string, unknown>;
    if (typeof b.lineItemId !== "string" || typeof b.txnId !== "string") throw new ValidationError({ lineItemId: ["Required"] });
    await dismissMatch(b.lineItemId, b.txnId);
    return ok({ dismissed: true });
  } catch (error) {
    return fail(error);
  }
}
