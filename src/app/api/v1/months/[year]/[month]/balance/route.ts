import { recordBillsBalance } from "@/server/month";
import { requireDevice } from "@/server/device-auth";
import { idempotent } from "@/server/idempotency";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";
import { parseEnteredAt } from "@/lib/api-dates";

export const dynamic = "force-dynamic";

/**
 * Set what is in the bills account this month.
 * Body: { amount: "3480.00", enteredAt?: ISO }; Idempotency-Key recommended.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ year: string; month: string }> }) {
  try {
    const auth = await requireDevice(request);
    return await idempotent(request, auth, async () => {
      const { year, month } = await params;
      const body = (await readJson(request)) as { amount?: unknown; enteredAt?: unknown };
      if (typeof body.amount !== "string" && typeof body.amount !== "number") {
        throw new ValidationError({ amount: ["Required"] });
      }
      await recordBillsBalance(Number(year), Number(month), parseCents(String(body.amount)), parseEnteredAt(body.enteredAt));
      return ok({ recorded: true });
    });
  } catch (error) {
    return fail(error);
  }
}
