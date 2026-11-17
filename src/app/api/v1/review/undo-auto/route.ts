import { requireDevice } from "@/server/device-auth";
import { undoAutoRecord } from "@/server/bills-auto";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Undo a payment recorded on its own; that charge isn't used for the bill again. Body: { lineItemId, year, month } */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const b = (await readJson(request)) as Record<string, unknown>;
    const year = Number(b.year);
    const month = Number(b.month);
    if (typeof b.lineItemId !== "string" || !Number.isInteger(year) || !Number.isInteger(month)) throw new ValidationError({ lineItemId: ["Required"] });
    await undoAutoRecord(b.lineItemId, year, month);
    return ok({ undone: true });
  } catch (error) {
    return fail(error);
  }
}
