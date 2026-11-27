import { requireDevice } from "@/server/device-auth";
import { markUsed } from "@/server/loyalty";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Counts a use, so the most used cards come first. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDevice(request);
    const { id } = await params;
    await markUsed(id);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
