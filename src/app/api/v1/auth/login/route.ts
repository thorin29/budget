import { checkCredentials } from "@/server/auth";
import { issueLoginProof } from "@/server/device-auth";
import { RateLimitedError, fail, ok, readJson } from "@/server/http";
import { limits } from "@/server/limits";
import { clientIp } from "@/lib/auth/client-ip";
import { normalizeUsername } from "@/lib/auth/rules";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

/**
 * PUBLIC. Step 1 of adding a phone: username + password → a five-minute proof.
 * Shares the web sign-in's rate limits, so the two doors can't be used to
 * double the guesses.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { username?: unknown; password?: unknown };
    const username = normalizeUsername(body.username);
    const ipKey = `ip:${clientIp(request.headers)}`;
    const userKey = `user:${username}`;
    const ipOk = limits.signInByIp.hit(ipKey);
    const userOk = limits.signInByUser.hit(userKey);
    if (!ipOk || !userOk) {
      throw new RateLimitedError(Math.max(limits.signInByIp.retryAfter(ipKey), limits.signInByUser.retryAfter(userKey)));
    }

    const user = await checkCredentials(username, body.password);
    if (!user) throw new ValidationError({ credentials: ["Wrong username or password"] }, "Wrong username or password");

    limits.signInByUser.reset(userKey);
    const { proof, expiresAt } = await issueLoginProof(user);
    return ok({ proof, expiresAt });
  } catch (error) {
    return fail(error);
  }
}
