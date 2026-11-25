import { requireDevice } from "@/server/device-auth";
import { setOwed } from "@/server/owed";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** Marks part or all of a charge as owed to you. Body: { personId: string | null, cents?: number }. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDevice(request);
    const { id } = await params;
    const b = (await readJson(request)) as Record<string, unknown>;
    if (b.personId !== null && typeof b.personId !== "string") throw new ValidationError({ personId: ["A person id, or null"] });
    if (b.cents !== undefined && b.cents !== null && typeof b.cents !== "number") throw new ValidationError({ cents: ["A whole number of cents"] });
    await setOwed(String(id), (b.personId as string | null) ?? null, typeof b.cents === "number" ? b.cents : null);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
