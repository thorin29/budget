import { requireDevice } from "@/server/device-auth";
import { idempotent } from "@/server/idempotency";
import { recordAmazonRun, SYNC_STATUSES, type SyncStatus } from "@/server/amazon-sync";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/**
 * How an Amazon sync went, sent at the end of every run, good or not:
 * `{ status, failedSection?, extensionVersion, ordersWaiting }`. Codes only, no text.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireDevice(request);
    return await idempotent(request, auth, async () => {
      const b = ((await readJson(request, 4 * 1024)) ?? {}) as Record<string, unknown>;
      const issues: Record<string, string[]> = {};
      if (!SYNC_STATUSES.includes(b.status as SyncStatus)) issues.status = [`One of ${SYNC_STATUSES.join(", ")}`];
      const section = b.failedSection == null || b.failedSection === "" ? null : b.failedSection;
      if (section !== null && (typeof section !== "string" || !/^[a-z0-9_]{1,40}$/.test(section))) issues.failedSection = ["Lowercase letters, digits and _ (40 at most)"];
      if (typeof b.extensionVersion !== "string" || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(b.extensionVersion)) issues.extensionVersion = ["Like 1.2.3"];
      const waiting = b.ordersWaiting ?? 0;
      if (!Number.isInteger(waiting) || (waiting as number) < 0 || (waiting as number) > 10_000) issues.ordersWaiting = ["A whole number"];
      if (Object.keys(issues).length) throw new ValidationError(issues);
      await recordAmazonRun({ status: b.status as SyncStatus, failedSection: section as string | null, extensionVersion: b.extensionVersion as string, ordersWaiting: waiting as number });
      return ok({ recorded: true });
    });
  } catch (error) {
    return fail(error);
  }
}
