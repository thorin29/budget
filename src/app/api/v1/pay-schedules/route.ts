import { createPaySchedule, listPaySchedules } from "@/server/pay-schedule";
import { created, fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ paySchedules: await listPaySchedules() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    return created(await createPaySchedule((await readJson(request)) as never));
  } catch (error) {
    return fail(error);
  }
}
