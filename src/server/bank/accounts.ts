/**
 * The feed's accounts. They set themselves up: each gets a type guessed from
 * its name (src/lib/account-type.ts), and the type decides how it counts.
 * The person only corrects a wrong type, hides an account that isn't theirs,
 * or picks which bank account the bills balance comes from.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { ACCOUNT_TYPES, displayAccountName, guessWithSiblings, isDormant, type AccountType } from "@/lib/account-type";
import { getSettings } from "../settings";
import { NotFoundError, ValidationError } from "../errors";
import { pushLinkedBalances, refreshTransfers } from "./sync";
import { applyCategories } from "../categorize";
import { isPeerPayment } from "@/lib/category-guess";

export interface BankAccountView {
  id: string;
  institution: string | null;
  name: string;
  displayName: string;
  currency: string;
  balanceCents: number | null;
  balanceDate: Date | null;
  type: AccountType;
  typeGuessed: boolean;
  hidden: boolean;
  dormant: boolean;
  /** Keeps the bills balance current. */
  isBillsSource: boolean;
  linkedAccountId: string | null;
  transactionCount: number;
  latestOn: Date | null;
  lastSeenAt: Date;
  statementCloseDay: number | null;
  paymentDueDay: number | null;
  /** YYYY-MM-DD. */
  promoEndsOn: string | null;
}

type Row = {
  id: string;
  institution: string | null;
  name: string;
  currency: string;
  balance: { toString(): string } | null;
  balanceDate: Date | null;
  type: AccountType;
  typeSource: string;
  hidden: boolean;
  linkedAccountId: string | null;
  lastSeenAt: Date;
  statementCloseDay?: number | null;
  paymentDueDay?: number | null;
  promoEndsOn?: Date | null;
};

/** Re-guesses every type the person hasn't set. Cheap; runs after each sync and on the Accounts page. */
export async function applyTypeGuesses(): Promise<void> {
  const rows = (await prisma.bankAccount.findMany({})) as Row[];
  const guesses = guessWithSiblings(rows.map((r) => ({ institution: r.institution, name: r.name, balanceCents: r.balance === null ? null : toCents(r.balance) })));
  for (let i = 0; i < rows.length; i += 1) {
    // A card paid down to zero loses its only clue; never fall back to Other once a type is known.
    if (rows[i].typeSource === "guess" && rows[i].type !== guesses[i] && guesses[i] !== "OTHER") {
      await prisma.bankAccount.update({ where: { id: rows[i].id }, data: { type: guesses[i] } });
    }
  }
}

/**
 * When the bills account has no bank feed yet and exactly one checking account
 * looks like it (named for bills, or the only active checking), connect them.
 */
export async function autoLinkBills(): Promise<void> {
  const { billsAccountId } = await getSettings();
  if (!billsAccountId) return;
  if (await prisma.bankAccount.findFirst({ where: { linkedAccountId: billsAccountId } })) return;
  const checking = (await listBankAccounts()).filter((a) => a.type === "CHECKING" && !a.hidden && !a.dormant);
  const named = checking.filter((a) => /\bbills?\b/i.test(a.name));
  const pick = named.length === 1 ? named[0] : checking.length === 1 ? checking[0] : null;
  if (!pick || pick.linkedAccountId) return;
  await prisma.bankAccount.update({ where: { id: pick.id }, data: { linkedAccountId: billsAccountId } });
  await pushLinkedBalances();
}

export async function listBankAccounts(): Promise<BankAccountView[]> {
  const [accounts, stats, settings] = await Promise.all([
    prisma.bankAccount.findMany({}),
    prisma.bankTransaction.groupBy({ by: ["accountId"], _count: { _all: true }, _max: { postedOn: true } }),
    getSettings(),
  ]);
  const byAccount = new Map(
    (stats as Array<{ accountId: string; _count: { _all: number }; _max: { postedOn: Date | null } }>).map((s) => [s.accountId, s]),
  );
  return (accounts as Row[])
    // Names are encrypted, so they sort here rather than in the database.
    .sort((a, b) => (a.institution ?? "~").localeCompare(b.institution ?? "~") || a.name.localeCompare(b.name))
    .map((a) => {
      const balanceCents = a.balance === null ? null : toCents(a.balance);
      const latestOn = byAccount.get(a.id)?._max.postedOn ?? null;
      return {
        id: a.id,
        institution: a.institution,
        name: a.name,
        displayName: displayAccountName(a.name),
        currency: a.currency,
        balanceCents,
        balanceDate: a.balanceDate,
        type: a.type,
        typeGuessed: a.typeSource === "guess",
        hidden: a.hidden,
        dormant: isDormant(balanceCents, latestOn),
        isBillsSource: Boolean(a.linkedAccountId && a.linkedAccountId === settings.billsAccountId),
        linkedAccountId: a.linkedAccountId,
        transactionCount: byAccount.get(a.id)?._count._all ?? 0,
        latestOn,
        lastSeenAt: a.lastSeenAt,
        statementCloseDay: a.statementCloseDay ?? null,
        paymentDueDay: a.paymentDueDay ?? null,
        promoEndsOn: a.promoEndsOn ? a.promoEndsOn.toISOString().slice(0, 10) : null,
      };
    });
}

const LONG_AGO = () => new Date(Date.now() - 800 * 86_400_000);

export async function setBankAccountType(id: string, type: string): Promise<void> {
  const parsed = z.enum(ACCOUNT_TYPES).safeParse(type);
  if (!parsed.success) throw new ValidationError({ type: ["Unknown account type"] });
  const current = await prisma.bankAccount.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Bank account");
  await prisma.bankAccount.update({ where: { id }, data: { type: parsed.data, typeSource: "user" } });
  const { syncLedgerAccounts } = await import("./ledger");
  await syncLedgerAccounts();
}

export async function setBankAccountHidden(id: string, hidden: boolean): Promise<void> {
  const current = await prisma.bankAccount.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Bank account");
  // A typed account loses its connection to a hidden feed account; an account made for the feed keeps it and drops out of the lists.
  const linked = current.linkedAccountId
    ? ((await prisma.account.findUnique({ where: { id: current.linkedAccountId }, select: { origin: true } })) as { origin: string } | null)
    : null;
  await prisma.bankAccount.update({ where: { id }, data: { hidden, ...(hidden && linked?.origin !== "bank" ? { linkedAccountId: null } : {}) } });
  await refreshTransfers(LONG_AGO());
  await applyCategories();
  const { syncLedgerAccounts } = await import("./ledger");
  await syncLedgerAccounts();
}

/** Which bank account keeps the bills balance current; null to type it by hand. */
export async function setBillsSource(bankAccountId: string | null): Promise<void> {
  const { billsAccountId } = await getSettings();
  if (!billsAccountId) throw new ValidationError({ billsAccountId: ["Choose a bills account first"] });
  const { connectAccount } = await import("./ledger");
  await connectAccount(billsAccountId, bankAccountId);
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
  categoryId: string | null;
  categorySource: string;
  /** A payment app: categories are set one transaction at a time. */
  peer: boolean;
}

export async function listBankTransactions({
  accountId,
  query,
  category,
  take = 200,
}: {
  accountId?: string;
  query?: string;
  /** A category id, or "none" for uncategorized money out. */
  category?: string;
  take?: number;
}): Promise<BankTransactionView[]> {
  const text = query?.trim().slice(0, 100).toLowerCase();
  const limit = Math.min(Math.max(take, 1), 1000);
  // Merchant and description are encrypted, so a search reads recent rows and matches them here.
  const rows = await prisma.bankTransaction.findMany({
    where: {
      ...(accountId ? { accountId } : {}),
      ...(category === "none" ? { categoryId: null, kind: "NORMAL" as const, amount: { lt: 0 } } : category ? { categoryId: category } : {}),
    },
    orderBy: [{ postedOn: "desc" }, { createdAt: "desc" }],
    take: text ? 20_000 : limit,
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
    categoryId: string | null;
    categorySource: string;
    account: { name: string; institution: string | null };
  }>)
    .filter((r) => !text || r.merchant.toLowerCase().includes(text) || r.description.toLowerCase().includes(text))
    .slice(0, limit)
    .map((r) => ({
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
    categoryId: r.categoryId,
    categorySource: r.categorySource,
    peer: isPeerPayment(r.merchant),
  }));
}
