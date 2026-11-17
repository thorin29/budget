import { requireDevice } from "@/server/device-auth";
import { fail } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Replaced by /api/v1/plan in 0.43. Safe to delete. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    throw new ValidationError({ app: ["Update the phone app: the spending plan is monthly now."] });
  } catch (error) {
    return fail(error);
  }
}
