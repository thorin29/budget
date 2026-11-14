/**
 * The rate limits on every sign-in path. Each pairs an IP limit with a second
 * key that is not the IP (the account, the user), so a wrong or shared IP
 * header neither locks everyone out nor lets one caller off the hook.
 */

import { headers } from "next/headers";
import { createLimiter } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/client-ip";

const FIFTEEN_MINUTES = 15 * 60_000;

export const limits = {
  signInByIp: createLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES }),
  signInByUser: createLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES }),
  setupByIp: createLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES }),
  joinByIp: createLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES }),
  passwordByUser: createLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES }),
  inviteByUser: createLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES }),
  enrollByIp: createLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES }),
  enrollByUser: createLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES }),
  enrollCodeByUser: createLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES }),
  refreshByDevice: createLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES }),
};

export async function callerIp(): Promise<string> {
  return clientIp(await headers());
}

export function tooMany(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
