/**
 * One account's last 30 days exactly as the bank feed sends them, to see which fields it fills in
 * (Settings → Bank sync). It's a live request, so it counts toward the feed's daily limit.
 */

import { prisma } from "@/lib/prisma";
import { open } from "@/lib/secret-box";
import { BankFeedError } from "@/lib/simplefin";
import { NotFoundError } from "../errors";
import { fetchRawAccounts } from "./simplefin-client";
import { getConnection } from "./sync";
import { configuredKey, MissingKeyError } from "@/lib/secret-box";

export interface RawFeedSample {
  account: Record<string, unknown>;
  transactions: Array<Record<string, unknown>>;
}

export async function rawFeedSample(bankAccountId: string): Promise<RawFeedSample> {
  const key = configuredKey();
  if (!key) throw new MissingKeyError();
  const connection = await getConnection();
  if (!connection) throw new NotFoundError("Bank connection");
  const acct = (await prisma.bankAccount.findUnique({ where: { id: bankAccountId }, select: { externalId: true } })) as { externalId: string } | null;
  if (!acct) throw new NotFoundError("Account");
  const doc = (await fetchRawAccounts(open(connection.accessUrlEnc, key), { startDate: new Date(Date.now() - 30 * 86_400_000), pending: true })) as { accounts?: Array<Record<string, unknown>> };
  const found = (doc.accounts ?? []).find((a) => a.id === acct.externalId);
  if (!found) throw new BankFeedError("The feed didn't include that account this time");
  const { transactions, ...account } = found as { transactions?: Array<Record<string, unknown>> } & Record<string, unknown>;
  return { account, transactions: (transactions ?? []).slice(0, 25) };
}
