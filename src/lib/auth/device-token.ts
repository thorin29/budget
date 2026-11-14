/**
 * Phone credentials, kept pure so they are unit-tested.
 *
 * - A device token is 32 random bytes with a `bud_` prefix (easy to spot if
 *   one ever lands in a log). Only its SHA-256 is stored.
 * - A login proof is what a correct password earns: a five-minute signed
 *   statement "this user just proved their password", spent together with
 *   the one-time code from the web to enrol a phone. Neither alone is enough.
 * - The add-a-phone code is 8 characters from an alphabet without look-alikes.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "bud_";

export function newDeviceToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A bearer token from an Authorization header, or null. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  return token.startsWith(TOKEN_PREFIX) && token.length <= 128 ? token : null;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newEnrollCode(): string {
  const chars = Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** "abcd efgh", "ABCD-EFGH" and "abcdefgh" all mean the same code. */
export function normalizeEnrollCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return chars.length === 8 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : "";
}

export interface LoginProof {
  userId: string;
  /** Seconds since the epoch. */
  expiresAt: number;
  credentialVersion: number;
}

function sign(payload: string, secret: string): string {
  // Domain-separated from the session cookie, which signs with the same secret.
  return createHmac("sha256", secret).update(`login-proof|${payload}`).digest("base64url");
}

export function encodeLoginProof(proof: LoginProof, secret: string): string {
  const payload = `${proof.userId}.${proof.expiresAt}.${proof.credentialVersion}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeLoginProof(token: unknown, secret: string, now = Date.now()): LoginProof | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, expires, version, signature] = parts;
  if (!/^[a-z0-9]+$/i.test(userId) || !/^\d+$/.test(expires) || !/^\d+$/.test(version)) return null;
  const expected = Buffer.from(sign(`${userId}.${expires}.${version}`, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  if (Number(expires) * 1000 <= now) return null;
  return { userId, expiresAt: Number(expires), credentialVersion: Number(version) };
}

/** A device name as the person typed it, trimmed to something displayable. */
export function cleanDeviceName(raw: unknown): string {
  const text = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  return text.slice(0, 60) || "Phone";
}
