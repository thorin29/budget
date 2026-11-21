import { enrollDevice } from "@/server/device-auth";
import { RateLimitedError, created, fail, readJson } from "@/server/http";
import { limits } from "@/server/limits";
import { clientIp } from "@/lib/auth/client-ip";
import { decodeLoginProofUserId } from "@/server/proof-user";

export const dynamic = "force-dynamic";

/**
 * PUBLIC. Step 2: the proof from step 1 + the one-time code from the web
 * (Settings → Sign-in & people → Add a phone) → this device's token, returned
 * once. Store it in the Android Keystore. Optional `scope`: "full" (default) or
 * "amazon", which only works on /api/v1/amazon/*, auth/refresh and auth/logout.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { proof?: unknown; code?: unknown; name?: unknown; scope?: unknown };
    const ipKey = `ip:${clientIp(request.headers)}`;
    const userKey = `user:${(await decodeLoginProofUserId(body.proof)) ?? "unknown"}`;
    const ipOk = limits.enrollByIp.hit(ipKey);
    const userOk = limits.enrollByUser.hit(userKey);
    if (!ipOk || !userOk) {
      throw new RateLimitedError(Math.max(limits.enrollByIp.retryAfter(ipKey), limits.enrollByUser.retryAfter(userKey)));
    }

    const { token, expiresAt, device } = await enrollDevice({ proof: body.proof, code: body.code, name: body.name, scope: body.scope });
    return created({ token, expiresAt, device });
  } catch (error) {
    return fail(error);
  }
}
