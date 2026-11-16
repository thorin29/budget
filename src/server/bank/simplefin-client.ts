/**
 * The only code in the app that makes outside requests. Every request:
 *  - goes to https on port 443, to a host on the allow-list (src/lib/simplefin.ts);
 *  - is refused if that host resolves to a private, loopback or link-local address;
 *  - follows no redirects;
 *  - gives up after 60 seconds and reads at most 25 MB.
 * Credentials travel in the Authorization header, never logged.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { BankFeedError, allowedHosts, checkUrl, decodeSetupToken, parseAccounts, type FeedDocument } from "@/lib/simplefin";

const TIMEOUT_MS = 60_000;
const MAX_BYTES = 25 * 1024 * 1024;

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = address.toLowerCase();
  return (
    v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") ||
    v6.startsWith("::ffff:10.") || v6.startsWith("::ffff:127.") || v6.startsWith("::ffff:192.168.")
  );
}

async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new BankFeedError(`Couldn't reach ${hostname}`);
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new BankFeedError(`${hostname} resolves to a private address; refusing`);
  }
}

async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new BankFeedError("The bank feed response is too large");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new BankFeedError("The bank feed response is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function guardedFetch(url: URL, init: { method: "GET" | "POST"; authorization?: string }): Promise<string> {
  await assertPublicHost(url.hostname);
  const target = new URL(url.toString());
  target.username = "";
  target.password = "";

  let response: Response;
  try {
    response = await fetch(target, {
      method: init.method,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "application/json, text/plain",
        "User-Agent": "budget-self-hosted",
        ...(init.method === "POST" ? { "Content-Length": "0" } : {}),
        ...(init.authorization ? { Authorization: init.authorization } : {}),
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new BankFeedError(timedOut ? "The bank feed took too long to answer" : `Couldn't reach ${url.hostname}`);
  }
  if (response.status >= 300 && response.status < 400) throw new BankFeedError("The bank feed tried to redirect; refusing");
  if (response.status === 403) throw new BankFeedError("The bank feed refused access. The token may be used or revoked.");
  if (response.status === 402) throw new BankFeedError("The bank feed says payment is required on your account there.");
  if (!response.ok) throw new BankFeedError(`The bank feed answered ${response.status}`);
  return readCapped(response);
}

/** Exchanges a setup token for the access URL. A token works once. */
export async function claimSetupToken(token: string): Promise<{ accessUrl: string; host: string }> {
  const hosts = allowedHosts();
  const claimUrl = decodeSetupToken(token, hosts);
  const body = (await guardedFetch(claimUrl, { method: "POST" })).trim();
  const access = checkUrl(body, hosts, { credentials: true });
  return { accessUrl: access.toString(), host: access.hostname };
}

export interface FetchOptions {
  startDate?: Date;
  endDate?: Date;
  pending?: boolean;
  balancesOnly?: boolean;
}

export async function fetchAccounts(accessUrl: string, options: FetchOptions = {}): Promise<FeedDocument> {
  const access = checkUrl(accessUrl, allowedHosts(), { credentials: true });
  const authorization =
    "Basic " +
    Buffer.from(`${decodeURIComponent(access.username)}:${decodeURIComponent(access.password)}`).toString("base64");

  const url = new URL(access.toString());
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/accounts`;
  url.search = "";
  if (options.startDate) url.searchParams.set("start-date", String(Math.floor(options.startDate.getTime() / 1000)));
  if (options.endDate) url.searchParams.set("end-date", String(Math.floor(options.endDate.getTime() / 1000)));
  if (options.pending) url.searchParams.set("pending", "1");
  if (options.balancesOnly) url.searchParams.set("balances-only", "1");

  const text = await guardedFetch(url, { method: "GET", authorization });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BankFeedError("The bank feed sent something that isn't JSON");
  }
  return parseAccounts(json);
}
