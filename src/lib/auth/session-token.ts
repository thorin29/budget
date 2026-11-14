/**
 * The session cookie: `userId.expiresAt.credentialVersion.signature`, where
 * the signature is HMAC-SHA256 over the first three parts with a secret kept
 * in the database. Stateless: checking one needs the secret and the user's
 * current credentialVersion, nothing else.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionClaims {
  userId: string;
  /** Seconds since the epoch. */
  expiresAt: number;
  credentialVersion: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeSession(claims: SessionClaims, secret: string): string {
  const payload = `${claims.userId}.${claims.expiresAt}.${claims.credentialVersion}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** The claims if the signature holds and it has not expired; otherwise null. */
export function decodeSession(token: string | undefined, secret: string, now = Date.now()): SessionClaims | null {
  if (!token || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, expires, version, signature] = parts;
  if (!/^[a-z0-9]+$/i.test(userId) || !/^\d+$/.test(expires) || !/^\d+$/.test(version)) return null;

  const expected = Buffer.from(sign(`${userId}.${expires}.${version}`, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  const expiresAt = Number(expires);
  if (expiresAt * 1000 <= now) return null;
  return { userId, expiresAt, credentialVersion: Number(version) };
}
