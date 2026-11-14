import { requireDevice } from "@/server/device-auth";
import { deletePaySchedule, getPaySchedule, updatePaySchedule } from "@/server/pay-schedule";
import { fail, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    await requireDevice(request);
    return ok(await getPaySchedule((await params).id));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    await requireDevice(request);
    return ok(await updatePaySchedule((await params).id, (await readJson(request)) as never));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    await requireDevice(request);
    await deletePaySchedule((await params).id);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
