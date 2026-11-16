/**
 * Encrypts a secret for storage with a key from the environment, so a copy of
 * the database (a backup, a dump) is useless without the container's settings.
 *
 * AES-256-GCM. The key is derived from BANK_SYNC_KEY with HKDF, so any long
 * random string works. Stored form: `v1.<iv>.<tag>.<ciphertext>`, base64url.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export const MIN_KEY_LENGTH = 32;

export class MissingKeyError extends Error {
  constructor() {
    super(`BANK_SYNC_KEY is not set (at least ${MIN_KEY_LENGTH} characters)`);
    this.name = "MissingKeyError";
  }
}

function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), `budget:${purpose}`, 32));
}

/** The configured key, or null when it is missing or too short. */
export function configuredKey(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.BANK_SYNC_KEY?.trim();
  return value && value.length >= MIN_KEY_LENGTH ? value : null;
}

export function seal(plain: string, secret: string, purpose = "bank-sync"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, purpose), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

/** Throws if the value was tampered with or sealed with a different key. */
export function open(sealed: string, secret: string, purpose = "bank-sync"): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || body === undefined) throw new Error("Unrecognized sealed value");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, purpose), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
