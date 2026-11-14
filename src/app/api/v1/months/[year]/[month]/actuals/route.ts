import { clearActual, recordActual } from "@/server/month";
import { requireDevice } from "@/server/device-auth";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ year: string; month: string }> };

function date(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const value = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

/**
 * Record what was paid (or received) for one item in this month. The phone
 * shows the same confirmation step as the web before calling this.
 * Body: { lineItemId, amount: "172.40", paidOn?: "2026-11-21" }
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { user } = await requireDevice(request);
    const { year, month } = await params;
    const body = (await readJson(request)) as { lineItemId?: unknown; amount?: unknown; paidOn?: unknown };
    if (typeof body.lineItemId !== "string") throw new ValidationError({ lineItemId: ["Required"] });
    if (typeof body.amount !== "string" && typeof body.amount !== "number") {
      throw new ValidationError({ amount: ["Required"] });
    }
    await recordActual(body.lineItemId, Number(year), Number(month), parseCents(String(body.amount)), undefined, date(body.paidOn), user.id);
    return ok({ recorded: true });
  } catch (error) {
    return fail(error);
  }
}

/** Mark it unpaid again. ?lineItemId=… */
export async function DELETE(request: Request, { params }: Params) {
  try {
    await requireDevice(request);
    const { year, month } = await params;
    const lineItemId = new URL(request.url).searchParams.get("lineItemId");
    if (!lineItemId) throw new ValidationError({ lineItemId: ["Required"] });
    await clearActual(lineItemId, Number(year), Number(month));
    return ok({ cleared: true });
  } catch (error) {
    return fail(error);
  }
}
