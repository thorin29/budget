import { requireDevice } from "@/server/device-auth";
import { addCard, listCards } from "@/server/loyalty";
import { created, fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** The household's loyalty cards, most used first. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    return ok({ cards: await listCards() });
  } catch (error) {
    return fail(error);
  }
}

/** Adds a card. Body: { name, number, format?, color?, memberName? }. */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    return created(await addCard((await readJson(request)) as Record<string, unknown>));
  } catch (error) {
    return fail(error);
  }
}
