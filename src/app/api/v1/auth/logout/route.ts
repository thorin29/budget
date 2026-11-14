import { requireDevice, revokeDevice } from "@/server/device-auth";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Signs this device out: its token stops working. */
export async function POST(request: Request) {
  try {
    const { user, device } = await requireDevice(request);
    await revokeDevice(user.id, device.id);
    return ok({ signedOut: true });
  } catch (error) {
    return fail(error);
  }
}
