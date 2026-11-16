/**
 * The SimpleFIN protocol, without the network: decoding a setup token,
 * checking hosts, and reading the accounts document. The fetching lives in
 * src/server/bank/simplefin-client.ts.
 *
 * Protocol: a setup token is a base64-encoded https claim URL. POSTing to it
 * once returns an access URL (https://user:pass@host/path). GET
 * {access}/accounts returns { errors, accounts: [...] }, each account with its
 * transactions. Amounts are decimal strings; dates are Unix seconds.
 */

import { z } from "zod";

/** Bridges known to speak SimpleFIN. More can be added with SIMPLEFIN_EXTRA_HOSTS. */
export const DEFAULT_HOSTS = ["bridge.simplefin.org", "beta-bridge.simplefin.org"];

export function allowedHosts(env: Record<string, string | undefined> = process.env): string[] {
  const extra = (env.SIMPLEFIN_EXTRA_HOSTS ?? "")
    .split(/[\s,]+/)
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h));
  return [...new Set([...DEFAULT_HOSTS, ...extra])];
}

export class BankFeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankFeedError";
  }
}

/** Throws unless the URL is https, has no odd parts, and its host is allowed. */
export function checkUrl(raw: string, hosts: string[], { credentials }: { credentials: boolean }): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BankFeedError("That isn't a valid link");
  }
  if (url.protocol !== "https:") throw new BankFeedError("The link must use https");
  if (url.port && url.port !== "443") throw new BankFeedError("The link uses an unexpected port");
  if (!hosts.includes(url.hostname.toLowerCase())) {
    throw new BankFeedError(`${url.hostname} isn't an allowed bank-sync host`);
  }
  const hasCredentials = Boolean(url.username || url.password);
  if (credentials && (!url.username || !url.password)) throw new BankFeedError("The access link is missing its credentials");
  if (!credentials && hasCredentials) throw new BankFeedError("The setup link shouldn't contain credentials");
  return url;
}

/** A setup token is base64 of the claim URL. Whitespace and line breaks are tolerated. */
export function decodeSetupToken(token: string, hosts: string[]): URL {
  const compact = token.replace(/\s+/g, "");
  if (!compact || compact.length > 2048 || !/^[A-Za-z0-9+/_-]+=*$/.test(compact)) {
    throw new BankFeedError("That doesn't look like a setup token");
  }
  const text = Buffer.from(compact.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8").trim();
  return checkUrl(text, hosts, { credentials: false });
}

// ---------------------------------------------------------------- accounts document

const decimal = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const text = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    ctx.addIssue({ code: "custom", message: "not a decimal" });
    return z.NEVER;
  }
  return text;
});
const seconds = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]);

const transaction = z.object({
  id: z.string().min(1).max(256),
  posted: seconds,
  amount: decimal,
  description: z.string().max(1000).default(""),
  payee: z.string().max(500).nullish(),
  memo: z.string().max(1000).nullish(),
  transacted_at: seconds.nullish(),
  pending: z.boolean().nullish(),
});

const account = z.object({
  id: z.string().min(1).max(256),
  name: z.string().max(300).default("Account"),
  currency: z.string().max(64).default("USD"),
  balance: decimal,
  "available-balance": decimal.nullish(),
  "balance-date": seconds,
  org: z.object({ name: z.string().max(300).nullish(), domain: z.string().max(300).nullish() }).partial().nullish(),
  conn_id: z.string().nullish(),
  transactions: z.array(transaction).default([]),
});

const document = z.object({
  errors: z.array(z.string()).default([]),
  errlist: z.array(z.object({ msg: z.string().nullish(), code: z.string().nullish() }).partial()).nullish(),
  connections: z.array(z.object({ conn_id: z.string(), name: z.string().nullish(), org_id: z.string().nullish() }).partial()).nullish(),
  accounts: z.array(account).default([]),
});

export interface FeedTransaction {
  externalId: string;
  postedOn: string; // YYYY-MM-DD
  amount: string;
  description: string;
  payee: string | null;
  memo: string | null;
  pending: boolean;
}

export interface FeedAccount {
  externalId: string;
  institution: string | null;
  name: string;
  currency: string;
  balance: string;
  availableBalance: string | null;
  balanceDate: Date;
  transactions: FeedTransaction[];
}

export interface FeedDocument {
  messages: string[];
  accounts: FeedAccount[];
}

/** Date in the given time zone, as YYYY-MM-DD. */
export function isoDay(epochSeconds: number, timeZone = process.env.TZ || "UTC"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(epochSeconds * 1000),
  );
}

export function parseAccounts(json: unknown, timeZone?: string): FeedDocument {
  const result = document.safeParse(json);
  if (!result.success) throw new BankFeedError("The bank feed sent something unexpected");
  const doc = result.data;
  const connectionNames = new Map((doc.connections ?? []).map((c) => [c.conn_id, c.name ?? null]));

  const messages = [
    ...doc.errors,
    ...(doc.errlist ?? []).map((e) => e.msg ?? "").filter(Boolean),
  ].map((m) => m.slice(0, 500));

  return {
    messages: [...new Set(messages)],
    accounts: doc.accounts.map((a) => ({
      externalId: a.id,
      institution: a.org?.name ?? (a.conn_id ? connectionNames.get(a.conn_id) ?? null : null) ?? a.org?.domain ?? null,
      name: a.name,
      currency: a.currency,
      balance: a.balance,
      availableBalance: a["available-balance"] ?? null,
      balanceDate: new Date(a["balance-date"] * 1000),
      transactions: a.transactions.map((t) => ({
        externalId: t.id,
        // A pending transaction may have posted = 0; fall back to when it happened.
        postedOn: isoDay(t.posted > 0 ? t.posted : (t.transacted_at ?? t.posted), timeZone),
        amount: t.amount,
        description: t.description.trim() || t.payee?.trim() || "(no description)",
        payee: t.payee?.trim() || null,
        memo: t.memo?.trim() || null,
        pending: Boolean(t.pending) || t.posted === 0,
      })),
    })),
  };
}
