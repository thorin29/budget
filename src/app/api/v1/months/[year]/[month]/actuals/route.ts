import { clearActual, recordActual } from "@/server/month";
import { requireDevice } from "@/server/device-auth";
import { idempotent } from "@/server/idempotency";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";
import { parseDay, parseEnteredAt } from "@/lib/api-dates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ year: string; month: string }> };

/**
 * Record what was paid (or received) for one item in this month. The phone
 * shows the same confirmation step as the web before calling this.
 *
 * Body: { lineItemId, amount: "172.40", paidOn?: "2026-11-21", enteredAt?: ISO }
 * Headers: Idempotency-Key (recommended; required for queued offline writes).
 * `enteredAt` is when Confirm was pressed; a 409 `changed_elsewhere` means the
 * entry changed after that and this write was not applied.
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    const auth = await requireDevice(request);
    return await idempotent(request, auth, async () => {
      const { year, month } = await params;
      const body = (await readJson(request)) as {
        lineItemId?: unknown;
        amount?: unknown;
        paidOn?: unknown;
        enteredAt?: unknown;
      };
      if (typeof body.lineItemId !== "string") throw new ValidationError({ lineItemId: ["Required"] });
      if (typeof body.amount !== "string" && typeof body.amount !== "number") {
        throw new ValidationError({ amount: ["Required"] });
      }
      await recordActual(
        body.lineItemId,
        Number(year),
        Number(month),
        parseCents(String(body.amount)),
        undefined,
        parseDay(body.paidOn),
        auth.user.id,
        parseEnteredAt(body.enteredAt),
      );
      return ok({ recorded: true });
    });
  } catch (error) {
    return fail(error);
  }
}

/** Mark it unpaid again. ?lineItemId=…&enteredAt=… */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const auth = await requireDevice(request);
    return await idempotent(request, auth, async () => {
      const { year, month } = await params;
      const query = new URL(request.url).searchParams;
      const lineItemId = query.get("lineItemId");
      if (!lineItemId) throw new ValidationError({ lineItemId: ["Required"] });
      await clearActual(lineItemId, Number(year), Number(month), parseEnteredAt(query.get("enteredAt")));
      return ok({ cleared: true });
    });
  } catch (error) {
    return fail(error);
  }
}
