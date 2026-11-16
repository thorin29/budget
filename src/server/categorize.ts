/**
 * Keeps bank transactions' categories current. In order of strength:
 *
 *  1. person — set on that transaction by hand; never changed here.
 *  2. bill   — the transaction was confirmed as a bill's payment; the bill's category.
 *  3. rule   — the person set a category for that merchant before.
 *  4. guess  — from the merchant's name (src/lib/category-guess.ts).
 *
 * Transfers and ignored rows carry no category unless the person gave one.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { merchantKey } from "@/lib/field-crypto";
import { guessFor, isPeerPayment, type GuessCategory } from "@/lib/category-guess";
import { NotFoundError, ValidationError } from "./errors";

type Row = {
  id: string;
  merchant: string;
  description: string;
  amount: { toString(): string };
  kind: "NORMAL" | "TRANSFER" | "IGNORED";
  categoryId: string | null;
  categorySource: string;
  account: { type: string };
  actual: { lineItem: { categoryId: string | null } } | null;
};

/** Finds the category a guess means, by name or alias, creating it the first time it's needed. */
async function categoryResolver() {
  const existing = (await prisma.category.findMany({ select: { id: true, name: true, active: true } })) as Array<{ id: string; name: string; active: boolean }>;
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
  const cache = new Map<string, string>();
  return async (guess: GuessCategory): Promise<string> => {
    const hit = cache.get(guess.name);
    if (hit) return hit;
    const found = [guess.name, ...guess.aliases].map((n) => byName.get(n.toLowerCase())).find((c) => c && c.active)
      ?? [guess.name, ...guess.aliases].map((n) => byName.get(n.toLowerCase())).find(Boolean);
    const id = found
      ? found.id
      : ((await prisma.category.upsert({ where: { name: guess.name }, create: { name: guess.name, sortOrder: 100 }, update: {}, select: { id: true } })) as { id: string }).id;
    cache.set(guess.name, id);
    return id;
  };
}

/**
 * Recomputes categories for every transaction the person hasn't set (or just
 * the given ones). Returns how many changed.
 */
export async function applyCategories(ids?: string[]): Promise<number> {
  const rows = (await prisma.bankTransaction.findMany({
    where: { categorySource: { not: "person" }, ...(ids ? { id: { in: ids } } : {}) },
    select: {
      id: true, merchant: true, description: true, amount: true, kind: true, categoryId: true, categorySource: true,
      account: { select: { type: true } },
      actual: { select: { lineItem: { select: { categoryId: true } } } },
    },
  })) as Row[];
  if (!rows.length) return 0;

  const rules = new Map(
    ((await prisma.categoryRule.findMany({ select: { merchantKey: true, categoryId: true } })) as Array<{ merchantKey: string; categoryId: string }>).map((r) => [r.merchantKey, r.categoryId]),
  );
  const resolve = await categoryResolver();

  // Group the changes so they go out as a few updateMany calls.
  const changes = new Map<string, string[]>();
  for (const row of rows) {
    let categoryId: string | null = null;
    let source = "guess";
    if (row.kind === "NORMAL") {
      const billCategory = row.actual?.lineItem.categoryId ?? null;
      const ruled = rules.get(merchantKey(row.merchant));
      if (billCategory) [categoryId, source] = [billCategory, "bill"];
      else if (ruled) [categoryId, source] = [ruled, "rule"];
      else {
        const guess = guessFor(row.merchant, row.description, toCents(row.amount), row.account.type === "CREDIT_CARD");
        if (guess) categoryId = await resolve(guess);
      }
    }
    if (categoryId === row.categoryId && source === row.categorySource) continue;
    const key = `${categoryId ?? ""}|${source}`;
    changes.set(key, [...(changes.get(key) ?? []), row.id]);
  }

  let changed = 0;
  for (const [key, list] of changes) {
    const [categoryId, source] = key.split("|");
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i + 1000);
      await prisma.bankTransaction.updateMany({ where: { id: { in: chunk } }, data: { categoryId: categoryId || null, categorySource: source } });
      changed += chunk.length;
    }
  }
  return changed;
}

/**
 * Sets one transaction's category. With `forMerchant`, the merchant is
 * remembered and every other transaction from it that the person hasn't set
 * follows. Returns how many others changed.
 */
export async function setTransactionCategory(txnId: string, categoryId: string | null, forMerchant: boolean): Promise<number> {
  const txn = (await prisma.bankTransaction.findUnique({ where: { id: txnId }, select: { id: true, merchant: true } })) as { id: string; merchant: string } | null;
  if (!txn) throw new NotFoundError("Transaction");
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) throw new ValidationError({ categoryId: ["Unknown category"] });
  }
  if (forMerchant && isPeerPayment(txn.merchant)) {
    throw new ValidationError({ categoryId: ["Payment apps carry unrelated payments, so set those one at a time"] });
  }
  await prisma.bankTransaction.update({ where: { id: txnId }, data: { categoryId, categorySource: "person" } });
  if (!forMerchant) return 0;
  const key = merchantKey(txn.merchant);
  if (categoryId) {
    await prisma.categoryRule.upsert({ where: { merchantKey: key }, create: { merchantKey: key, categoryId }, update: { categoryId } });
  } else {
    await prisma.categoryRule.deleteMany({ where: { merchantKey: key } });
  }
  return applyCategories();
}

/** Hands a transaction back to the automatic rules. */
export async function resetTransactionCategory(txnId: string): Promise<void> {
  const found = await prisma.bankTransaction.findUnique({ where: { id: txnId }, select: { id: true } });
  if (!found) throw new NotFoundError("Transaction");
  await prisma.bankTransaction.update({ where: { id: txnId }, data: { categorySource: "guess", categoryId: null } });
  await applyCategories([txnId]);
}
