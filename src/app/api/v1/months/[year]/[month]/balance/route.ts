import { recordBillsBalance } from "@/server/month";
import { requireDevice } from "@/server/device-auth";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Set what is in the bills account this month. Body: { amount: "3480.00" } */
export async function PUT(request: Request, { params }: { params: Promise<{ year: string; month: string }> }) {
  try {
    await requireDevice(request);
    const { year, month } = await params;
    const body = (await readJson(request)) as { amount?: unknown };
    if (typeof body.amount !== "string" && typeof body.amount !== "number") {
      throw new ValidationError({ amount: ["Required"] });
    }
    await recordBillsBalance(Number(year), Number(month), parseCents(String(body.amount)));
    return ok({ recorded: true });
  } catch (error) {
    return fail(error);
  }
}
