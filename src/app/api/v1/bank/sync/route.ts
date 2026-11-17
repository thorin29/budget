import { requireDevice } from "@/server/device-auth";
import { getConnection, syncBankIfStale } from "@/server/bank/sync";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * "Sync now" from a phone. Skipped when the last attempt was minutes ago; the
 * daily request cap applies. Returns when the bank was last read.
 */
export async function POST(request: Request) {
  try {
    await requireDevice(request);
    const { ran, result } = await syncBankIfStale();
    const connection = await getConnection();
    return ok({
      ran,
      added: result?.added ?? 0,
      lastSuccessAt: connection?.lastSuccessAt?.toISOString() ?? null,
      lastError: connection?.lastError ?? null,
    });
  } catch (error) {
    return fail(error);
  }
}
