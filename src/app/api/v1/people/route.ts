import { requireDevice } from "@/server/device-auth";
import { addPerson, owedSummary, people } from "@/server/owed";
import { created, fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** People who can owe you, with what each owes now. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const open = new Map((await owedSummary()).map((p) => [p.id, p.openCents]));
    return ok({ people: (await people()).map((p) => ({ ...p, openCents: open.get(p.id) ?? 0 })) });
  } catch (error) {
    return fail(error);
  }
}

/** Adds someone. Body: { name: string }. */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const b = (await readJson(request)) as Record<string, unknown>;
    return created(await addPerson(b.name));
  } catch (error) {
    return fail(error);
  }
}
