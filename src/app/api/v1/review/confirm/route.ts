import { requireDevice } from "@/server/device-auth";
import { idempotent } from "@/server/idempotency";
import { confirmMatch } from "@/server/review";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * The confirm step for a "looks paid" charge: records the payment with the
 * amount and date the person accepted, ties it to the charge and remembers the
 * merchant. Body: { lineItemId, year, month, txnId, amount: "172.40", paidOn: "2026-11-21" }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireDevice(request);
    return await idempotent(request, auth, async () => {
      const b = (await readJson(request)) as Record<string, unknown>;
      if (typeof b.lineItemId !== "string" || typeof b.txnId !== "string") throw new ValidationError({ lineItemId: ["Required"] });
      if (typeof b.paidOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.paidOn)) throw new ValidationError({ paidOn: ["Use YYYY-MM-DD"] });
      const year = Number(b.year);
      const month = Number(b.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new ValidationError({ month: ["Unknown month"] });
      await confirmMatch({
        lineItemId: b.lineItemId,
        year,
        month,
        txnId: b.txnId,
        amountCents: parseCents(String(b.amount ?? "")),
        paidOn: new Date(`${b.paidOn}T00:00:00Z`),
        userId: auth.user.id,
      });
      return ok({ recorded: true });
    });
  } catch (error) {
    return fail(error);
  }
}
