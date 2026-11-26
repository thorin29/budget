import { requireDevice } from "@/server/device-auth";
import { owedSummary } from "@/server/owed";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Owed to You: each person's charges, payments back, what's open, and payments that may be theirs. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    return ok({ people: await owedSummary() });
  } catch (error) {
    return fail(error);
  }
}
