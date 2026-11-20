/**
 * Reading a session, without next/headers, so the proxy and the app code share
 * one rule: valid signature, not expired, user still exists, credentialVersion
 * unchanged.
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decodeSession } from "@/lib/auth/session-token";

const SECRET_KEY = "auth.sessionSecret";

export interface SessionUser {
  id: string;
  username: string;
  credentialVersion: number;
}

export async function userCount(): Promise<number> {
  return prisma.user.count();
}

let cachedSecret: string | null = null;

/**
 * The cookie-signing secret: 32 random bytes minted on first use and kept in
 * the database, never a default. SESSION_SECRET overrides it. Deleting the row
 * and restarting signs everyone out.
 */
export async function sessionSecret(): Promise<string> {
  const override = process.env.SESSION_SECRET;
  if (override && override.length >= 32) return override;
  if (cachedSecret) return cachedSecret;

  const existing = (await prisma.setting.findUnique({ where: { key: SECRET_KEY } })) as {
    value: unknown;
  } | null;
  if (typeof existing?.value === "string" && existing.value.length >= 32) {
    cachedSecret = existing.value;
    return cachedSecret;
  }

  const minted = randomBytes(32).toString("base64url");
  // Two first requests racing: whichever row lands first wins, both read it.
  await prisma.setting.upsert({
    where: { key: SECRET_KEY },
    create: { key: SECRET_KEY, value: minted },
    update: {},
  });
  const stored = (await prisma.setting.findUnique({ where: { key: SECRET_KEY } })) as { value: unknown };
  cachedSecret = String(stored.value);
  return cachedSecret;
}

/**
 * The user a cookie value belongs to, or null. Shared by the proxy and the app
 * code so there is one rule: valid signature, not expired, user still exists,
 * credentialVersion unchanged.
 */
export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const claims = decodeSession(token, await sessionSecret());
  if (!claims) return null;
  const user = (await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, username: true, credentialVersion: true },
  })) as SessionUser | null;
  if (!user || user.credentialVersion !== claims.credentialVersion) return null;
  return user;
}


/**
 * Replaces the cookie-signing secret with a new random one: every session (both people, every
 * browser) stops working and has to sign in again. For a secret that may have been seen.
 */
export async function rotateSessionSecret(): Promise<void> {
  const minted = randomBytes(32).toString("base64url");
  await prisma.setting.upsert({ where: { key: SECRET_KEY }, create: { key: SECRET_KEY, value: minted }, update: { value: minted } });
  cachedSecret = minted;
}
