import { requireDevice } from "@/server/device-auth";
import { setTransactionCategory } from "@/server/categorize";
import { setTransfer } from "@/server/transfer-mark";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/**
 * Sets a transaction's category, or marks it as a transfer. Body: { categoryId: string | null,
 * forMerchant?: boolean } or { transfer: boolean }.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireDevice(request);
    const { id } = await params;
    const b = (await readJson(request)) as Record<string, unknown>;
    if (typeof b.transfer === "boolean") {
      await setTransfer(String(id), b.transfer);
      return ok({ ok: true, others: 0 });
    }
    if (b.categoryId !== null && typeof b.categoryId !== "string") throw new ValidationError({ categoryId: ["A category id, or null"] });
    if (b.forMerchant !== undefined && typeof b.forMerchant !== "boolean") throw new ValidationError({ forMerchant: ["true or false"] });
    // Moving off "Transfer" first, when a category is picked for one.
    await setTransfer(String(id), false).catch(() => undefined);
    const others = await setTransactionCategory(String(id), (b.categoryId as string | null) ?? null, b.forMerchant === true);
    return ok({ ok: true, others });
  } catch (error) {
    return fail(error);
  }
}
