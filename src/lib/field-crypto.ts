/**
 * Field-level encryption for text that identifies a person: bank account and
 * institution names, merchants, descriptions, memos, notes, payment links.
 * Encrypted before it reaches the database and decrypted when read, so a
 * database backup or dump shows ciphertext for those fields. Amounts, dates
 * and categories stay plain, so totals and sorting still happen in the
 * database; on their own they point to no one.
 *
 * AES-256-GCM with a fresh IV per value, under a key derived from
 * BANK_SYNC_KEY (a separate HKDF purpose from the access link's). Stored form:
 * `enc:v1.<iv>.<tag>.<ciphertext>`. Values without the prefix are read as they
 * are, so rows written before encryption keep working until they are sealed.
 *
 * Encrypted fields can't be searched or sorted in SQL; the code that needs to
 * does it in memory after reading.
 */

import { createHmac, hkdfSync } from "node:crypto";
import { configuredKey, open, seal } from "./secret-box";

const PREFIX = "enc:";
const PURPOSE = "fields";

/** Which text fields are encrypted, per Prisma model. */
export const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  BankAccount: ["institution", "name", "nickname"],
  BankTransaction: ["description", "payee", "memo", "merchant"],
  BankImport: ["fileName"],
  LineItem: ["paymentUrl", "notes"],
  ActualEntry: ["note"],
  MonthlyPlan: ["note"],
  PayDateOverride: ["note"],
  TransactionSplit: ["note"],
};

export function fieldKey(env: Record<string, string | undefined> = process.env): string | null {
  return configuredKey(env);
}

export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function sealField(value: string, key: string): string {
  return isSealed(value) ? value : PREFIX + seal(value, key, PURPOSE);
}

/** Plain values pass through. A value sealed with another key reads as a marker rather than failing the page. */
export function openField(value: string, key: string | null): string {
  if (!isSealed(value)) return value;
  if (!key) return "[encrypted]";
  try {
    return open(value.slice(PREFIX.length), key, PURPOSE);
  } catch {
    return "[unreadable]";
  }
}

function sealRecord(model: string, data: unknown, key: string): unknown {
  if (Array.isArray(data)) return data.map((d) => sealRecord(model, d, key));
  if (!data || typeof data !== "object") return data;
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields) return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const field of fields) {
    const v = out[field];
    if (typeof v === "string" && v !== "") out[field] = sealField(v, key);
    // Prisma's `{ set: "…" }` update form.
    else if (v && typeof v === "object" && typeof (v as { set?: unknown }).set === "string") {
      out[field] = { set: sealField((v as { set: string }).set, key) };
    }
  }
  return out;
}

/** Encrypts the writable parts of a Prisma operation's arguments for one model. */
export function sealArgs(model: string, operation: string, args: unknown, key: string): unknown {
  if (!ENCRYPTED_FIELDS[model] || !args || typeof args !== "object") return args;
  const a = { ...(args as Record<string, unknown>) };
  if (operation === "upsert") {
    a.create = sealRecord(model, a.create, key);
    a.update = sealRecord(model, a.update, key);
  } else if ("data" in a) {
    a.data = sealRecord(model, a.data, key);
  }
  return a;
}

/** Decrypts every sealed string anywhere in a result, including included relations. */
export function openDeep<T>(value: T, key: string | null): T {
  if (isSealed(value)) return openField(value, key) as T;
  if (Array.isArray(value)) return value.map((v) => openDeep(v, key)) as T;
  if (value && typeof value === "object" && !(value instanceof Date) && !isDecimalLike(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = openDeep(v, key);
    return out as T;
  }
  return value;
}

function isDecimalLike(value: object): boolean {
  // Prisma Decimal and Buffers must keep their prototype.
  return Buffer.isBuffer(value) || typeof (value as { toFixed?: unknown }).toFixed === "function";
}

/** Whether a where clause filters on an encrypted field; such filters can't work and are refused. */
export function filtersEncrypted(model: string, where: unknown): string | null {
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields || !where || typeof where !== "object") return null;
  const stack: unknown[] = [where];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (fields.includes(k) && v !== null && !(typeof v === "object" && v && "not" in v && (v as { not: unknown }).not === null)) return k;
      if (k === "AND" || k === "OR" || k === "NOT") stack.push(...(Array.isArray(v) ? v : [v]));
    }
  }
  return null;
}

/**
 * A stable, keyed fingerprint of a merchant name, so "charges from this
 * merchant pay this bill" can be stored and looked up without storing the
 * name. Without a key it falls back to a plain hash (equality still leaks,
 * names don't).
 */
export function merchantKey(merchant: string, key: string | null = fieldKey()): string {
  const normalized = merchant.toLowerCase().replace(/\s+/g, " ").trim();
  const secret = key ? Buffer.from(hkdfSync("sha256", Buffer.from(key, "utf8"), Buffer.alloc(0), "budget:merchant-key", 32)) : Buffer.alloc(0);
  return createHmac("sha256", secret).update(normalized).digest("hex").slice(0, 32);
}
