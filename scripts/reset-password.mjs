#!/usr/bin/env node
/**
 * Recovery when a password is forgotten. There is no email, so the person who
 * runs the server resets it from inside the container:
 *
 *   docker exec -it budget node scripts/reset-password.mjs <username>
 *
 * Sets a random temporary password, prints it once, and signs that account out
 * everywhere. Sign in with it, then change it under Settings → Sign-in & people.
 * Run with no username to list the accounts.
 *
 * The hash format matches src/lib/auth/password.ts; a test holds them together.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { pathToFileURL } from "node:url";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error
        ? reject(error)
        : resolve(["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$")),
    );
  });
}

/** 20 characters from an alphabet without look-alikes. */
export function temporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(20), (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const { default: pg } = await import("pg");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Run this inside the budget container.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    const username = (process.argv[2] ?? "").trim().toLowerCase();
    if (!username) {
      const { rows } = await client.query('SELECT username FROM "User" ORDER BY "createdAt"');
      console.log(rows.length ? `Accounts: ${rows.map((r) => r.username).join(", ")}` : "No accounts yet.");
      console.log("Usage: node scripts/reset-password.mjs <username>");
      return;
    }

    const password = temporaryPassword();
    const { rowCount } = await client.query(
      'UPDATE "User" SET "passwordHash" = $1, "credentialVersion" = "credentialVersion" + 1, "updatedAt" = now() WHERE username = $2',
      [await hashPassword(password), username],
    );
    if (!rowCount) {
      console.error(`No account named "${username}". Run without a username to list them.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Temporary password for ${username}: ${password}`);
    console.log("Every session for that account has been signed out. Sign in, then change it under Settings → Sign-in & people.");
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
