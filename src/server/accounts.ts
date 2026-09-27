/**
 * Accounts — where money sits or is owed.
 *
 * Entirely user-defined. The application ships with none, and no name,
 * institution or vendor appears anywhere in this repository.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "./errors";

export const ACCOUNT_KINDS = ["BANK", "CREDIT_CARD", "CASH", "OTHER"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  active: boolean;
  sortOrder: number;
  /** For a card: the account that pays it off. Reporting only. */
  settledById: string | null;
  createdAt: string;
  updatedAt: string;
}

const accountInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  kind: z.enum(ACCOUNT_KINDS),
  settledById: z.string().trim().min(1).nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type AccountInput = z.input<typeof accountInput>;

function parse(input: unknown) {
  const result = accountInput.safeParse(input);
  if (!result.success) {
    throw new ValidationError(z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

type Row = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  sortOrder: number;
  settledById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toAccount(row: Row): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as AccountKind,
    active: row.active,
    sortOrder: row.sortOrder,
    settledById: row.settledById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAccounts(
  options: { includeInactive?: boolean } = {},
): Promise<Account[]> {
  const rows = await prisma.account.findMany({
    where: options.includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toAccount);
}

export async function getAccount(id: string): Promise<Account> {
  const row = await prisma.account.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Account");
  return toAccount(row);
}

export async function createAccount(input: AccountInput): Promise<Account> {
  const data = parse(input);
  await assertSettledByIsValid(data.kind, data.settledById ?? null, null);

  try {
    const row = await prisma.account.create({
      data: {
        name: data.name,
        kind: data.kind,
        settledById: data.settledById ?? null,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    return toAccount(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError({ name: ["An account with that name already exists"] });
    }
    throw error;
  }
}

export async function updateAccount(id: string, input: AccountInput): Promise<Account> {
  const data = parse(input);
  await getAccount(id);
  await assertSettledByIsValid(data.kind, data.settledById ?? null, id);

  try {
    const row = await prisma.account.update({
      where: { id },
      data: {
        name: data.name,
        kind: data.kind,
        settledById: data.settledById ?? null,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    return toAccount(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError({ name: ["An account with that name already exists"] });
    }
    throw error;
  }
}

/**
 * Deletes only when nothing references the account. Anything in use is
 * deactivated instead, so history keeps its meaning.
 */
export async function deleteAccount(id: string): Promise<{ deleted: boolean }> {
  await getAccount(id);

  const [paidFrom, chargedTo, balances] = await Promise.all([
    prisma.lineItem.count({ where: { paidFromId: id } }),
    prisma.lineItem.count({ where: { chargedToId: id } }),
    prisma.balanceSnapshot.count({ where: { accountId: id } }),
  ]);

  if (paidFrom + chargedTo + balances > 0) {
    await prisma.account.update({ where: { id }, data: { active: false } });
    return { deleted: false };
  }

  await prisma.account.delete({ where: { id } });
  return { deleted: true };
}

/** A card may name the account that settles it; nothing else may. */
async function assertSettledByIsValid(
  kind: AccountKind,
  settledById: string | null,
  selfId: string | null,
): Promise<void> {
  if (!settledById) return;

  if (kind !== "CREDIT_CARD") {
    throw new ValidationError({
      settledById: ["Only a credit card can name the account that settles it"],
    });
  }
  if (settledById === selfId) {
    throw new ValidationError({ settledById: ["An account cannot settle itself"] });
  }

  const target = await prisma.account.findUnique({ where: { id: settledById } });
  if (!target) throw new ValidationError({ settledById: ["No such account"] });
  if (target.kind === "CREDIT_CARD") {
    throw new ConflictError("A credit card cannot be settled by another credit card");
  }
}
