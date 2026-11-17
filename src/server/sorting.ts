/**
 * Sorting uncategorized spending, one merchant at a time: the merchants with
 * charges but no category, largest first, each settled with one choice: a
 * category (remembered, so past and future charges follow) or a bill it pays
 * (every charge then counts as that bill, not as spending).
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { merchantKey } from "@/lib/field-crypto";
import { SPENDING_TYPES, displayAccountName, type AccountType } from "@/lib/account-type";
import { isPeerPayment } from "@/lib/category-guess";
import { applyCategories } from "./categorize";
import { billMerchantKeys } from "./bill-merchants";
import { NotFoundError, ValidationError } from "./errors";

export interface UnsortedMerchant {
  key: string;
  merchant: string;
  count: number;
  /** Spent over the last twelve months. */
  cents: number;
  lastOn: string;
  accounts: string[];
  /** Venmo, Zelle and the like: each payment differs, so they're set one at a time on Transactions. */
  peer: boolean;
  /** A few descriptions, to tell what it is. */
  examples: string[];
}

export async function listUnsorted(): Promise<{ merchants: UnsortedMerchant[]; totalCents: number }> {
  const since = new Date(Date.now() - 366 * 86_400_000);
  const rows = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: since }, categoryId: null, kind: "NORMAL", pending: false, amount: { lt: 0 }, account: { hidden: false }, actual: { is: null } },
    select: { postedOn: true, amount: true, merchant: true, description: true, account: { select: { type: true, name: true, nickname: true } } },
    orderBy: { postedOn: "desc" },
  })) as Array<{ postedOn: Date; amount: { toString(): string }; merchant: string; description: string; account: { type: AccountType; name: string; nickname: string | null } }>;
  const bills = await billMerchantKeys();
  const groups = new Map<string, UnsortedMerchant>();
  for (const r of rows) {
    if (!SPENDING_TYPES.includes(r.account.type)) continue;
    const name = r.merchant.trim() || r.description.trim();
    // The same key the category rules use.
    const key = merchantKey(r.merchant);
    if (bills.has(key)) continue;
    const g = groups.get(key) ?? { key, merchant: name, count: 0, cents: 0, lastOn: r.postedOn.toISOString().slice(0, 10), accounts: [], peer: isPeerPayment(name), examples: [] };
    g.count += 1;
    g.cents += -toCents(r.amount);
    const account = r.account.nickname || displayAccountName(r.account.name);
    if (!g.accounts.includes(account)) g.accounts.push(account);
    if (g.examples.length < 2 && r.description && !g.examples.includes(r.description)) g.examples.push(r.description);
    groups.set(key, g);
  }
  const merchants = [...groups.values()].sort((a, b) => b.cents - a.cents);
  return { merchants, totalCents: merchants.reduce((s, m) => s + m.cents, 0) };
}

/** The merchant's name as stored, found from its key among recent charges. */
async function merchantFor(key: string): Promise<{ merchant: string; txnId: string }> {
  if (!/^[0-9a-f]{32}$/.test(key)) throw new ValidationError({ key: ["Unknown merchant"] });
  const rows = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: new Date(Date.now() - 800 * 86_400_000) }, kind: "NORMAL" },
    select: { id: true, merchant: true, description: true },
    orderBy: { postedOn: "desc" },
  })) as Array<{ id: string; merchant: string; description: string }>;
  const hit = rows.find((r) => merchantKey(r.merchant) === key);
  if (!hit) throw new NotFoundError("Merchant");
  return { merchant: hit.merchant, txnId: hit.id };
}

/** Every charge from the merchant, past and future, gets this category (unless one was set by hand). */
export async function sortMerchant(key: string, categoryId: string): Promise<{ merchant: string; changed: number }> {
  const { merchant } = await merchantFor(key);
  if (isPeerPayment(merchant)) throw new ValidationError({ key: ["Payment apps carry unrelated payments, so set those one at a time on Transactions"] });
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) throw new ValidationError({ categoryId: ["Pick a category"] });
  await prisma.categoryRule.upsert({ where: { merchantKey: key }, create: { merchantKey: key, categoryId }, update: { categoryId } });
  return { merchant, changed: await applyCategories() };
}

/**
 * The merchant pays a bill: every charge from it counts as that bill (not as
 * spending), takes the bill's category, and future charges are recorded for it.
 */
export async function merchantPaysBill(key: string, lineItemId: string): Promise<{ merchant: string; bill: string }> {
  const { merchant } = await merchantFor(key);
  if (isPeerPayment(merchant)) throw new ValidationError({ key: ["Payment apps carry unrelated payments, so they can't pay a bill as a whole"] });
  const item = (await prisma.lineItem.findUnique({ where: { id: lineItemId }, select: { id: true, name: true, kind: true, categoryId: true } })) as
    | { id: string; name: string; kind: string; categoryId: string | null }
    | null;
  if (!item || item.kind === "INCOME") throw new ValidationError({ lineItemId: ["Pick a bill"] });
  await prisma.billRule.upsert({
    where: { lineItemId_merchantKey: { lineItemId: item.id, merchantKey: key } },
    create: { lineItemId: item.id, merchantKey: key, coversAll: true },
    update: { coversAll: true },
  });
  if (item.categoryId) {
    await prisma.categoryRule.upsert({ where: { merchantKey: key }, create: { merchantKey: key, categoryId: item.categoryId }, update: { categoryId: item.categoryId } });
    await applyCategories();
  }
  return { merchant, bill: item.name };
}

export interface MaybeBill extends UnsortedMerchant {
  categoryName: string;
  /** Bills in the same category, the likeliest first. */
  billIds: string[];
}

/**
 * Charges counted as spending in a category that bills use (Giving, Utilities,
 * Insurance…) and not tied to any bill: often a bill paid under another name,
 * counted twice. Each can be marked as paying its bill.
 */
export async function listMaybeBills(): Promise<MaybeBill[]> {
  const items = (await prisma.lineItem.findMany({
    where: { active: true, kind: { not: "INCOME" }, categoryId: { not: null } },
    select: { id: true, categoryId: true },
  })) as Array<{ id: string; categoryId: string }>;
  if (!items.length) return [];
  const billsByCategory = new Map<string, string[]>();
  for (const i of items) billsByCategory.set(i.categoryId, [...(billsByCategory.get(i.categoryId) ?? []), i.id]);
  const since = new Date(Date.now() - 366 * 86_400_000);
  const rows = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: since }, categoryId: { in: [...billsByCategory.keys()] }, kind: "NORMAL", pending: false, amount: { lt: 0 }, account: { hidden: false }, actual: { is: null } },
    select: { postedOn: true, amount: true, merchant: true, description: true, categoryId: true, category: { select: { name: true } }, account: { select: { type: true, name: true, nickname: true } } },
    orderBy: { postedOn: "desc" },
  })) as Array<{ postedOn: Date; amount: { toString(): string }; merchant: string; description: string; categoryId: string; category: { name: string }; account: { type: AccountType; name: string; nickname: string | null } }>;
  const covered = await billMerchantKeys();
  const linked = new Set(((await prisma.billRule.findMany({ select: { merchantKey: true } })) as Array<{ merchantKey: string }>).map((r) => r.merchantKey));
  const groups = new Map<string, MaybeBill>();
  for (const r of rows) {
    if (!SPENDING_TYPES.includes(r.account.type)) continue;
    const key = merchantKey(r.merchant);
    if (covered.has(key) || isPeerPayment(r.merchant)) continue;
    const name = r.merchant.trim() || r.description.trim();
    const g = groups.get(key) ?? {
      key, merchant: name, count: 0, cents: 0, lastOn: r.postedOn.toISOString().slice(0, 10), accounts: [], peer: false, examples: [],
      categoryName: r.category.name, billIds: billsByCategory.get(r.categoryId) ?? [],
    };
    g.count += 1;
    g.cents += -toCents(r.amount);
    const account = r.account.nickname || displayAccountName(r.account.name);
    if (!g.accounts.includes(account)) g.accounts.push(account);
    groups.set(key, g);
  }
  // A merchant already confirmed for a bill once is the strongest sign; those first.
  return [...groups.values()].sort((a, b) => Number(linked.has(b.key)) - Number(linked.has(a.key)) || b.cents - a.cents).slice(0, 30);
}
