import { joinWithInvite } from "@/server/auth";
import { enrollNewAccountDevice } from "@/server/device-auth";
import { RateLimitedError, created, fail, readJson } from "@/server/http";
import { limits } from "@/server/limits";
import { ValidationError } from "@/server/errors";
import { clientIp } from "@/lib/auth/client-ip";

export const dynamic = "force-dynamic";

/**
 * PUBLIC. The second person, from the phone: the one-time invite code (from
 * the web's QR, Settings → Sign-in & people) plus a username and password of
 * their own → their account, and this phone's token, returned once. The
 * invite is single-use and expires; the same rules as joining on the web.
 */
export async function POST(request: Request) {
  try {
    const key = `ip:${clientIp(request.headers)}`;
    if (!limits.joinByIp.hit(key)) throw new RateLimitedError(limits.joinByIp.retryAfter(key));
    const body = (await readJson(request)) as { code?: unknown; username?: unknown; password?: unknown; name?: unknown };
    const user = await joinWithInvite({ code: body.code, username: body.username, password: body.password, confirm: body.password });
    const { token, expiresAt, device } = await enrollNewAccountDevice(user, body.name);
    return created({ token, expiresAt, device, user: { id: user.id, username: user.username } });
  } catch (error) {
    // The phone shows one line: say which field and what's wrong with it.
    if (error instanceof ValidationError) {
      const [field, problems] = Object.entries(error.issues)[0] ?? [];
      const label: Record<string, string> = { username: "Username", password: "Password", confirm: "Password" };
      const text = problems?.[0];
      if (text) return fail(new ValidationError(error.issues, label[field!] ? `${label[field!]}: ${text}` : text));
    }
    return fail(error);
  }
}
