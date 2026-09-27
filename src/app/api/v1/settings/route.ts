import { getSettings, updateSettings } from "@/server/settings";
import { fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getSettings());
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    return ok(await updateSettings((await readJson(request)) as never));
  } catch (error) {
    return fail(error);
  }
}
