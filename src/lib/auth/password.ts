/**
 * Password hashing: scrypt with a random 16-byte salt per password, stored as
 * `scrypt$N$r$p$salt$hash` so the cost can rise later without breaking old
 * hashes. Verification compares in constant time.
 *
 * scripts/reset-password.mjs writes the same format; a test keeps them in step.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
// scrypt needs 128 * N * r bytes; Node's default ceiling is 32 MB.
const MAX_MEM = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  try {
    const actual = await scrypt(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * A hash of nothing in particular, checked when the username does not exist,
 * so a wrong username takes as long as a wrong password and does not reveal
 * which accounts exist.
 */
let decoy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  decoy ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await decoy);
}
