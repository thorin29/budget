import { requireDevice } from "@/server/device-auth";
import { addRepeatAsBill, dismissRepeat } from "@/server/review";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/**
 * A repeating charge: make it a monthly bill, or stop suggesting it.
 * Body: { key, action: "add" | "dismiss" }
 */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const b = (await readJson(request)) as Record<string, unknown>;
    if (typeof b.key !== "string") throw new ValidationError({ key: ["Required"] });
    if (b.action === "add") return ok({ added: true, ...(await addRepeatAsBill(b.key)) });
    if (b.action === "dismiss") {
      await dismissRepeat(b.key);
      return ok({ dismissed: true });
    }
    throw new ValidationError({ action: ["Use add or dismiss"] });
  } catch (error) {
    return fail(error);
  }
}
