import { requireDevice } from "@/server/device-auth";
import { getSettings, updateSettings } from "@/server/settings";
import { fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireDevice(request);
    return ok(await getSettings());
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireDevice(request);
    return ok(await updateSettings((await readJson(request)) as never));
  } catch (error) {
    return fail(error);
  }
}
