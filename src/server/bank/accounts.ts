/** The feed's accounts as Settings shows them, and the choices made about each. */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { NotFoundError, ValidationError } from "../errors";
import { pushLinkedBalances, refreshTransfers } from "./sync";

export const BANK_USES = ["SPENDING", "BALANCE_ONLY", "HIDDEN"] as const;
export type BankUse = (typeof BANK_USES)[number];

export interface BankAccountView {
  id: string;
  institution: string | null;
  name: string;
  currency: string;
  balanceCents: number | null;
  balanceDate: Date | null;
  use: BankUse | null;
  linkedAccountId: string | null;
  transactionCount: number;
  latestOn: Date | null;
  lastSeenAt: Date;
}

export async function listBankAccounts(): Promise<BankAccountView[]> {
  const [accounts, stats] = await Promise.all([
    prisma.bankAccount.findMany({ orderBy: [{ institution: "asc" }, { name: "asc" }] }),
    prisma.bankTransaction.groupBy({ by: ["accountId"], _count: { _all: true }, _max: { postedOn: true } }),
  ]);
  const byAccount = new Map(
    (stats as Array<{ accountId: string; _count: { _all: number }; _max: { postedOn: Date | null } }>).map((s) => [s.accountId, s]),
  );
  return (accounts as Array<{
    id: string;
    institution: string | null;
    name: string;
    currency: string;
    balance: { toString(): string } | null;
    balanceDate: Date | null;
    use: BankUse | null;
    linkedAccountId: string | null;
    lastSeenAt: Date;
  }>).map((a) => ({
    id: a.id,
    institution: a.institution,
    name: a.name,
    currency: a.currency,
    balanceCents: a.balance === null ? null : toCents(a.balance),
    balanceDate: a.balanceDate,
    use: a.use,
    linkedAccountId: a.linkedAccountId,
    transactionCount: byAccount.get(a.id)?._count._all ?? 0,
    latestOn: byAccount.get(a.id)?._max.postedOn ?? null,
    lastSeenAt: a.lastSeenAt,
  }));
}

const choiceInput = z.object({
  id: z.string().min(1),
  use: z.enum(BANK_USES).nullable(),
  linkedAccountId: z.string().min(1).nullable(),
});

export async function setBankAccountChoice(input: z.input<typeof choiceInput>): Promise<void> {
  const parsed = choiceInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
  const { id, use, linkedAccountId } = parsed.data;

  const current = await prisma.bankAccount.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Bank account");

  if (linkedAccountId) {
    const target = await prisma.account.findUnique({ where: { id: linkedAccountId } });
    if (!target) throw new ValidationError({ linkedAccountId: ["No such account"] });
    if (target.kind !== "BANK") throw new ValidationError({ linkedAccountId: ["Only a bank account's balance can be kept current"] });
    if (use === "HIDDEN") throw new ValidationError({ linkedAccountId: ["A hidden account can't keep a balance current"] });
    // One feed account per Budget account: taking it over releases the old link.
    await prisma.bankAccount.updateMany({ where: { linkedAccountId, NOT: { id } }, data: { linkedAccountId: null } });
  }

  await prisma.bankAccount.update({ where: { id }, data: { use, linkedAccountId } });
  if (use !== current.use) await refreshTransfers(new Date(Date.now() - 800 * 86_400_000));
  if (linkedAccountId) await pushLinkedBalances();
}

export interface BankTransactionView {
  id: string;
  postedOn: Date;
  accountName: string;
  institution: string | null;
  merchant: string;
  description: string;
  amountCents: number;
  pending: boolean;
  kind: "NORMAL" | "TRANSFER" | "IGNORED";
  source: string;
}

export async function listBankTransactions({
  accountId,
  query,
  take = 200,
}: {
  accountId?: string;
  query?: string;
  take?: number;
}): Promise<BankTransactionView[]> {
  const text = query?.trim().slice(0, 100);
  const rows = await prisma.bankTransaction.findMany({
    where: {
      ...(accountId ? { accountId } : {}),
      ...(text
        ? { OR: [{ merchant: { contains: text, mode: "insensitive" } }, { description: { contains: text, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: [{ postedOn: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(take, 1), 1000),
    include: { account: { select: { name: true, institution: true } } },
  });
  return (rows as Array<{
    id: string;
    postedOn: Date;
    merchant: string;
    description: string;
    amount: { toString(): string };
    pending: boolean;
    kind: "NORMAL" | "TRANSFER" | "IGNORED";
    source: string;
    account: { name: string; institution: string | null };
  }>).map((r) => ({
    id: r.id,
    postedOn: r.postedOn,
    accountName: r.account.name,
    institution: r.account.institution,
    merchant: r.merchant,
    description: r.description,
    amountCents: toCents(r.amount),
    pending: r.pending,
    kind: r.kind,
    source: r.source,
  }));
}
