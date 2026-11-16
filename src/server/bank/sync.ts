/**
 * Bank sync: connecting, pulling the feed, and keeping derived facts current
 * (merchant names, transfers, linked balances).
 *
 * The feed is read-only. Each sync asks for the last 90 days on the first run
 * and from two weeks before the last good sync after that, so pending charges
 * that settle at a different amount are corrected.
 */

import { prisma } from "@/lib/prisma";
import { toCents, toDecimalString } from "@/lib/money";
import { cleanMerchant } from "@/lib/merchant";
import { matchDuplicates } from "@/lib/bank-match";
import { isVerificationNoise, pairTransfers } from "@/lib/transfers";
import { BankFeedError, type FeedDocument } from "@/lib/simplefin";
import { MissingKeyError, configuredKey, open, seal } from "@/lib/secret-box";
import { ConflictError, NotFoundError } from "../errors";
import { claimSetupToken, fetchAccounts } from "./simplefin-client";

const DAY = 86_400_000;
// Bridges cap a request at 90 days; asking for 89 avoids a "capped" warning on every first sync.
const FIRST_SYNC_DAYS = 89;
const OVERLAP_DAYS = 14;
const LOCK_MINUTES = 15;

export interface SyncResult {
  accounts: number;
  added: number;
  updated: number;
  removed: number;
  transfers: number;
  messages: string[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dateOnly = (s: string) => new Date(`${s}T00:00:00Z`);

function localYearMonth(now = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "UTC",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
  };
}

function requireKey(): string {
  const key = configuredKey();
  if (!key) throw new MissingKeyError();
  return key;
}

export async function getConnection() {
  return prisma.bankConnection.findUnique({ where: { id: "default" } });
}

export async function connectBank(setupToken: string): Promise<SyncResult | null> {
  const key = requireKey();
  if (await getConnection()) throw new ConflictError("Bank sync is already connected. Disconnect it first.");
  const { accessUrl, host } = await claimSetupToken(setupToken);
  await prisma.bankConnection.create({ data: { id: "default", accessUrlEnc: seal(accessUrl, key), host } });
  try {
    return await syncBank();
  } catch {
    // Connected; the first sync's problem is recorded on the connection and shown.
    return null;
  }
}

/** Forgets the access URL. Accounts and transactions stay until deleted. */
export async function disconnectBank(): Promise<void> {
  await prisma.bankConnection.deleteMany({});
}

export async function deleteAllBankData(): Promise<void> {
  await prisma.$transaction([
    prisma.bankTransaction.deleteMany({}),
    prisma.bankImport.deleteMany({}),
    prisma.bankAccount.deleteMany({}),
    prisma.bankConnection.deleteMany({}),
  ]);
}

export async function syncBank(): Promise<SyncResult> {
  const key = requireKey();
  const connection = await getConnection();
  if (!connection) throw new NotFoundError("Bank connection");

  let accessUrl: string;
  try {
    accessUrl = open(connection.accessUrlEnc, key);
  } catch {
    const message = "BANK_SYNC_KEY has changed since connecting. Disconnect and connect again with a new setup token.";
    await prisma.bankConnection.update({ where: { id: "default" }, data: { lastError: message, lastSyncAt: new Date() } });
    throw new BankFeedError(message);
  }

  const now = new Date();
  const locked = await prisma.bankConnection.updateMany({
    where: {
      id: "default",
      OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(now.getTime() - LOCK_MINUTES * 60_000) } }],
    },
    data: { syncStartedAt: now },
  });
  if (locked.count === 0) throw new ConflictError("A sync is already running");

  try {
    const earliest = new Date(now.getTime() - FIRST_SYNC_DAYS * DAY);
    const start = connection.lastSuccessAt
      ? new Date(Math.max(connection.lastSuccessAt.getTime() - OVERLAP_DAYS * DAY, earliest.getTime()))
      : earliest;
    const doc = await fetchAccounts(accessUrl, { startDate: start, pending: true });
    const result = await applyFeed(doc, start, now);
    await pushLinkedBalances();
    result.transfers = await refreshTransfers(new Date(start.getTime() - 7 * DAY));
    await prisma.bankConnection.update({
      where: { id: "default" },
      data: { lastSyncAt: now, lastSuccessAt: now, lastError: null, messages: doc.messages, syncStartedAt: null },
    });
    return result;
  } catch (error) {
    const message = error instanceof BankFeedError ? error.message : "The sync failed. Details are in the server log.";
    if (!(error instanceof BankFeedError)) console.error("Bank sync failed:", error);
    await prisma.bankConnection.update({
      where: { id: "default" },
      data: { lastSyncAt: now, lastError: message, syncStartedAt: null },
    });
    throw error instanceof BankFeedError ? error : new BankFeedError(message);
  }
}

type Existing = {
  id: string;
  externalId: string | null;
  postedOn: Date;
  amount: { toString(): string };
  description: string;
  payee: string | null;
  memo: string | null;
  pending: boolean;
  merchant: string;
};

async function applyFeed(doc: FeedDocument, start: Date, now: Date): Promise<SyncResult> {
  const result: SyncResult = { accounts: doc.accounts.length, added: 0, updated: 0, removed: 0, transfers: 0, messages: doc.messages };

  for (const feed of doc.accounts) {
    const account = await prisma.bankAccount.upsert({
      where: { externalId: feed.externalId },
      create: {
        externalId: feed.externalId,
        institution: feed.institution,
        name: feed.name,
        currency: feed.currency,
        balance: feed.balance,
        availableBalance: feed.availableBalance,
        balanceDate: feed.balanceDate,
        lastSeenAt: now,
      },
      update: {
        institution: feed.institution,
        name: feed.name,
        currency: feed.currency,
        balance: feed.balance,
        availableBalance: feed.availableBalance,
        balanceDate: feed.balanceDate,
        lastSeenAt: now,
      },
    });

    const windowStart = new Date(start.getTime() - 7 * DAY);
    const existing = (await prisma.bankTransaction.findMany({
      where: { accountId: account.id, postedOn: { gte: dateOnly(iso(windowStart)) } },
      select: { id: true, externalId: true, postedOn: true, amount: true, description: true, payee: true, memo: true, pending: true, merchant: true },
    })) as Existing[];
    const byExternal = new Map(existing.filter((e) => e.externalId).map((e) => [e.externalId as string, e]));
    const csvRows = existing.filter((e) => !e.externalId);

    const fresh = feed.transactions.filter((t) => !byExternal.has(t.externalId));
    const merges = matchDuplicates(
      csvRows.map((e) => ({ postedOn: iso(e.postedOn), amountCents: toCents(e.amount), merchant: e.merchant })),
      fresh.map((t) => ({ postedOn: t.postedOn, amountCents: toCents(t.amount), merchant: cleanMerchant(t.description, t.payee) })),
    );

    const seen = new Set(feed.transactions.map((t) => t.externalId));
    for (const t of feed.transactions) {
      const merchant = cleanMerchant(t.description, t.payee);
      const data = {
        postedOn: dateOnly(t.postedOn),
        amount: t.amount,
        description: t.description,
        payee: t.payee,
        memo: t.memo,
        pending: t.pending,
        merchant,
      };
      const known = byExternal.get(t.externalId);
      if (known) {
        const changed =
          iso(known.postedOn) !== t.postedOn || toCents(known.amount) !== toCents(t.amount) ||
          known.description !== t.description || known.pending !== t.pending || known.merchant !== merchant ||
          known.payee !== t.payee || known.memo !== t.memo;
        if (changed) {
          await prisma.bankTransaction.update({ where: { id: known.id }, data });
          result.updated += 1;
        }
        continue;
      }
      const mergeIndex = merges[fresh.indexOf(t)];
      if (mergeIndex !== undefined && mergeIndex !== -1) {
        // The CSV copy becomes the feed's copy; the CSV's date is kept, since it is when the money moved.
        const row = csvRows[mergeIndex];
        await prisma.bankTransaction.update({
          where: { id: row.id },
          data: { externalId: t.externalId, payee: t.payee, memo: t.memo, pending: t.pending },
        });
        result.updated += 1;
        continue;
      }
      await prisma.bankTransaction.create({ data: { ...data, accountId: account.id, externalId: t.externalId, source: "sync" } });
      result.added += 1;
    }

    // A pending charge that vanished from the feed was replaced by its posted copy or dropped.
    const vanished = existing.filter((e) => e.externalId && e.pending && !seen.has(e.externalId) && e.postedOn >= start);
    if (vanished.length) {
      await prisma.bankTransaction.deleteMany({ where: { id: { in: vanished.map((e) => e.id) } } });
      result.removed += vanished.length;
    }
  }
  return result;
}

/** Linked bank accounts write this month's balance into Budget's balance for that account. */
export async function pushLinkedBalances(): Promise<void> {
  const linked = await prisma.bankAccount.findMany({
    where: { linkedAccountId: { not: null }, balance: { not: null }, NOT: { use: "HIDDEN" } },
    select: { linkedAccountId: true, balance: true },
  });
  const { year, month } = localYearMonth();
  for (const row of linked) {
    const amount = toDecimalString(toCents(row.balance as { toString(): string }));
    await prisma.balanceSnapshot.upsert({
      where: { accountId_year_month: { accountId: row.linkedAccountId as string, year, month } },
      create: { accountId: row.linkedAccountId as string, year, month, amount },
      update: { amount, asOf: new Date() },
    });
  }
}

/**
 * Re-derives transfers and verification noise from `since` on. Pairs touching
 * an account that is no longer included are undone first.
 */
export async function refreshTransfers(since: Date): Promise<number> {
  const sinceDay = dateOnly(iso(since));
  const included = { use: { in: ["SPENDING", "BALANCE_ONLY"] as Array<"SPENDING" | "BALANCE_ONLY"> } };

  await prisma.bankTransaction.updateMany({
    where: { kind: "TRANSFER", postedOn: { gte: sinceDay }, NOT: { account: included } },
    data: { kind: "NORMAL", transferOfId: null },
  });
  // Partners of rows just reset.
  const orphans = (await prisma.bankTransaction.findMany({
    where: { kind: "TRANSFER", postedOn: { gte: sinceDay } },
    select: { id: true, transferOfId: true },
  })) as Array<{ id: string; transferOfId: string | null }>;
  const transferIds = new Set(orphans.map((o) => o.id));
  const lonely = orphans.filter((o) => !o.transferOfId || !transferIds.has(o.transferOfId)).map((o) => o.id);
  if (lonely.length) {
    await prisma.bankTransaction.updateMany({ where: { id: { in: lonely } }, data: { kind: "NORMAL", transferOfId: null } });
  }

  const rows = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: sinceDay }, kind: "NORMAL", pending: false, account: included },
    select: { id: true, accountId: true, postedOn: true, amount: true, description: true },
  })) as Array<{ id: string; accountId: string; postedOn: Date; amount: { toString(): string }; description: string }>;
  const candidates = rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    postedOn: iso(r.postedOn),
    amountCents: toCents(r.amount),
    description: r.description,
  }));

  const noise = candidates.filter(isVerificationNoise).map((c) => c.id);
  if (noise.length) await prisma.bankTransaction.updateMany({ where: { id: { in: noise } }, data: { kind: "IGNORED" } });

  const noiseSet = new Set(noise);
  const pairs = pairTransfers(candidates.filter((c) => !noiseSet.has(c.id)));
  for (const [out, inn] of pairs) {
    await prisma.$transaction([
      prisma.bankTransaction.update({ where: { id: out }, data: { kind: "TRANSFER", transferOfId: inn } }),
      prisma.bankTransaction.update({ where: { id: inn }, data: { kind: "TRANSFER", transferOfId: out } }),
    ]);
  }
  return pairs.length;
}
