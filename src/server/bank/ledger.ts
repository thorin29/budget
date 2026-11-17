/**
 * One set of accounts. Bills name an account to be paid from; with bank sync,
 * those accounts are the feed's accounts:
 *
 *  - An account typed by hand is connected to its feed account when the match
 *    is clear (shared name words, the institution's initials, or the same
 *    last digits, and a compatible type). The person can change it.
 *  - Every other feed account bills could be paid from (checking, savings,
 *    cards that are in use) gets an account behind it, origin "bank". Its
 *    stored name is a placeholder; the feed account's encrypted name is shown.
 *  - A connected account's balance comes from the bank after every sync.
 */

import { prisma } from "@/lib/prisma";
import { displayAccountName, type AccountType } from "@/lib/account-type";
import { clearMatches, matchScore } from "@/lib/ledger-match";
import { listBankAccounts, type BankAccountView } from "./accounts";
import { pushLinkedBalances } from "./sync";
import { getSettings, setBillsAccountId } from "../settings";
import { NotFoundError, ValidationError } from "../errors";

const USABLE: readonly AccountType[] = ["CHECKING", "SAVINGS", "CREDIT_CARD"];
type Ledger = { id: string; name: string; kind: string; active: boolean; origin: string; bankAccount: { id: string } | null };

const usable = (b: BankAccountView) => !b.hidden && !b.dormant && USABLE.includes(b.type);

async function ledgers(): Promise<Ledger[]> {
  return (await prisma.account.findMany({ select: { id: true, name: true, kind: true, active: true, origin: true, bankAccount: { select: { id: true } } } })) as Ledger[];
}

/** Runs after each sync and at start. Never changes a connection the person made or an account they typed. */
export async function syncLedgerAccounts(): Promise<void> {
  const banks = await listBankAccounts();
  let accounts = await ledgers();

  // 1. Connect hand-typed accounts whose feed account is clear.
  const openBanks = banks.filter((b) => usable(b) && !b.linkedAccountId);
  const openManual = accounts.filter((a) => a.origin === "manual" && a.active && !a.bankAccount);
  for (const [a, b] of clearMatches(openManual, openBanks, matchScore)) {
    await prisma.bankAccount.update({ where: { id: b.id }, data: { linkedAccountId: a.id } });
    b.linkedAccountId = a.id;
  }

  // 2. Every other usable feed account gets an account behind it.
  for (const b of banks.filter((x) => usable(x) && !x.linkedAccountId)) {
    // Reuses the account made for it before, if it lost its link.
    const created = (await prisma.account.upsert({
      where: { name: `bank:${b.id}` },
      create: { name: `bank:${b.id}`, kind: b.type === "CREDIT_CARD" ? "CREDIT_CARD" : "BANK", origin: "bank", sortOrder: 50 },
      update: {},
      select: { id: true },
    })) as { id: string };
    await prisma.bankAccount.update({ where: { id: b.id }, data: { linkedAccountId: created.id } });
  }

  // 3. Accounts made for the feed follow it: hidden or quiet feed accounts drop out of the lists, and come back.
  accounts = await ledgers();
  const byId = new Map(banks.map((b) => [b.id, b]));
  for (const a of accounts.filter((x) => x.origin === "bank")) {
    const b = a.bankAccount ? byId.get(a.bankAccount.id) : undefined;
    const active = Boolean(b && usable(b));
    if (active !== a.active) await prisma.account.update({ where: { id: a.id }, data: { active } });
  }
  await pushLinkedBalances();
}

/**
 * Connects an account to a feed account (or disconnects it with null). When the
 * feed account already backs an account made for it, that account's bills and
 * history move over and it is removed, so there is one account, not two.
 */
export async function connectAccount(accountId: string, bankAccountId: string | null): Promise<void> {
  const account = (await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, kind: true, origin: true } })) as { id: string; kind: string; origin: string } | null;
  if (!account) throw new NotFoundError("Account");
  if (account.origin === "bank" && !bankAccountId) throw new ValidationError({ bankAccountId: ["This account comes from the bank feed"] });

  await prisma.bankAccount.updateMany({ where: { linkedAccountId: accountId }, data: { linkedAccountId: null } });
  if (!bankAccountId) return;

  const bank = (await prisma.bankAccount.findUnique({ where: { id: bankAccountId }, select: { id: true, hidden: true, linkedAccountId: true } })) as { id: string; hidden: boolean; linkedAccountId: string | null } | null;
  if (!bank) throw new NotFoundError("Bank account");
  if (bank.hidden) throw new ValidationError({ bankAccountId: ["That account is hidden"] });

  const previous = bank.linkedAccountId;
  if (previous && previous !== accountId) {
    const other = (await prisma.account.findUnique({ where: { id: previous }, select: { origin: true } })) as { origin: string } | null;
    await prisma.bankAccount.update({ where: { id: bank.id }, data: { linkedAccountId: null } });
    if (other?.origin === "bank") await mergeInto(previous, accountId);
  }
  await prisma.bankAccount.update({ where: { id: bank.id }, data: { linkedAccountId: accountId } });
  await pushLinkedBalances();
}

/** Moves everything that names `from` onto `to`, then removes `from`. */
async function mergeInto(from: string, to: string): Promise<void> {
  await prisma.lineItem.updateMany({ where: { paidFromId: from }, data: { paidFromId: to } });
  await prisma.lineItem.updateMany({ where: { chargedToId: from }, data: { chargedToId: to } });
  await prisma.account.updateMany({ where: { settledById: from }, data: { settledById: to } });
  // Balances came from the bank; the next push rewrites them for `to`.
  await prisma.balanceSnapshot.deleteMany({ where: { accountId: from } });
  const { billsAccountId } = await getSettings();
  if (billsAccountId === from) await setBillsAccountId(to);
  await prisma.account.delete({ where: { id: from } });
}

/** What to call each account: the typed name, or the feed account's name for accounts made for the feed. */
export function ledgerLabel(row: { name: string; origin?: string; bankAccount?: { institution: string | null; name: string; nickname?: string | null } | null }): string {
  if (row.origin === "bank" && row.bankAccount) return row.bankAccount.nickname || displayAccountName(row.bankAccount.name);
  return row.name;
}

export async function accountLabels(): Promise<Map<string, string>> {
  const rows = (await prisma.account.findMany({ select: { id: true, name: true, origin: true, bankAccount: { select: { institution: true, name: true, nickname: true } } } })) as Array<{
    id: string;
    name: string;
    origin: string;
    bankAccount: { institution: string | null; name: string; nickname: string | null } | null;
  }>;
  const labels = rows.map((r) => ({ id: r.id, label: ledgerLabel(r), institution: r.bankAccount?.institution ?? null }));
  // Two feed accounts with the same name ("Checking") get their institution added.
  const seen = new Map<string, number>();
  for (const l of labels) seen.set(l.label, (seen.get(l.label) ?? 0) + 1);
  return new Map(labels.map((l) => [l.id, (seen.get(l.label) ?? 0) > 1 && l.institution ? `${l.label} · ${l.institution}` : l.label]));
}
