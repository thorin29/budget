import { requireDevice } from "@/server/device-auth";
import { deleteCard, updateCard } from "@/server/loyalty";
import { fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Changes a card. Body as for adding one. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDevice(request);
    const { id } = await params;
    return ok(await updateCard(id, (await readJson(request)) as Record<string, unknown>));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDevice(request);
    const { id } = await params;
    await deleteCard(id);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
