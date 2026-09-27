import { getProjection } from "@/server/projection-view";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const pay = Number(params.get("proposedPaymentCents"));
    const days = Number(params.get("horizonDays"));

    return ok(
      await getProjection({
        proposedPaymentCents: Number.isInteger(pay) && pay > 0 ? pay : undefined,
        horizonDays: Number.isInteger(days) && days >= 7 ? days : undefined,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}
