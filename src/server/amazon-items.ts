/**
 * Amazon item categories that stick: when the person fixes the category of one item in a split
 * charge, Ledger remembers it for that item (by Amazon's product id, and by its name) and applies
 * it to every split of the same item, now and in later syncs.
 *
 * Items are remembered by a keyed hash, never by name: the rules hold hashes and category ids only.
 * The sync (src/server/amazon-sync.ts) uses itemKeys and ruleFor when it writes splits.
 */

import { prisma } from "@/lib/prisma";
import { merchantKey } from "@/lib/field-crypto";
import { NotFoundError, ValidationError } from "./errors";

const KEY = "amazonItemRules";

const normalize = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

/** The keys an item is known by: its product id (when known) first, then its name. */
export function itemKeys(name: string | null, productId?: string | null): string[] {
  const out: string[] = [];
  if (productId) out.push(merchantKey(`amazon-product:${productId}`));
  if (name) out.push(merchantKey(`amazon-item:${normalize(name)}`));
  return out;
}

export async function itemRules(): Promise<Record<string, string>> {
  const row = (await prisma.setting.findUnique({ where: { key: KEY } })) as { value: unknown } | null;
  const v = row?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
}

/** The category remembered for an item, if any. */
export function ruleFor(rules: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) if (rules[k]) return rules[k];
  return null;
}

/** Gives older one-item splits (written before items had keys) their name key. */
async function backfillItemKeys(): Promise<void> {
  const rows = (await prisma.transactionSplit.findMany({ where: { source: "amazon", itemKey: null }, select: { id: true, note: true } })) as Array<{ id: string; note: string | null }>;
  for (const r of rows) {
    if (!r.note || r.note.includes("; ")) continue;
    await prisma.transactionSplit.update({ where: { id: r.id }, data: { itemKey: itemKeys(r.note)[0] } });
  }
}

/**
 * Sets one split part's category, remembers it for that item, and applies it to every other split
 * of the same item. Returns how many other parts changed.
 */
export async function setSplitCategory(splitId: string, categoryId: string | null): Promise<number> {
  const split = (await prisma.transactionSplit.findUnique({ where: { id: splitId }, select: { id: true, note: true, itemKey: true } })) as {
    id: string;
    note: string | null;
    itemKey: string | null;
  } | null;
  if (!split) throw new NotFoundError("That item is gone");
  if (categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!cat) throw new ValidationError({ category: ["Pick a category"] });
  }
  await prisma.transactionSplit.update({ where: { id: split.id }, data: { categoryId } });
  // A part holding several items (from before per-item splits) is fixed alone.
  const single = !!split.note && !split.note.includes("; ");
  const keys = [...new Set([...(split.itemKey ? [split.itemKey] : []), ...(single ? itemKeys(split.note) : [])])];
  if (!keys.length) return 0;
  await backfillItemKeys();
  const rules = await itemRules();
  for (const k of keys) {
    if (categoryId) rules[k] = categoryId;
    else delete rules[k];
  }
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: rules as never }, update: { value: rules as never } });
  const others = await prisma.transactionSplit.updateMany({ where: { itemKey: { in: keys }, id: { not: split.id } }, data: { categoryId } });
  return others.count;
}

const AMAZON = /amazon|amzn|amz\b|amz\*|whole ?foods|wholefds/i;
const DAY = 86_400_000;
const toCentsOf = (v: { toString(): string }) => Math.round(Number(v.toString()) * 100);

/**
 * Items still without a category get another look: a category fixed for the same item, else what
 * the item's name now says (the name rules grow over time). Returns how many were placed.
 */
export async function placeUncategorizedItems(): Promise<number> {
  const rows = (await prisma.transactionSplit.findMany({ where: { source: "amazon", categoryId: null }, select: { id: true, note: true, itemKey: true } })) as Array<{
    id: string;
    note: string | null;
    itemKey: string | null;
  }>;
  if (!rows.length) return 0;
  const [{ itemKind }, { categoriesForKinds }] = await Promise.all([import("@/lib/amazon-orders"), import("./amazon-import")]);
  const rules = await itemRules();
  const kinds = rows.map((r) => (r.note && !r.note.includes("; ") ? itemKind(r.note) : "other"));
  const category = await categoriesForKinds(new Set(kinds.filter((k) => k !== "other")));
  let placed = 0;
  for (const [i, r] of rows.entries()) {
    const keys = [...new Set([...(r.itemKey ? [r.itemKey] : []), ...(r.note ? itemKeys(r.note) : [])])];
    const categoryId = ruleFor(rules, keys) ?? (kinds[i] === "other" ? null : (category.get(kinds[i]) ?? null));
    if (!categoryId) continue;
    await prisma.transactionSplit.update({ where: { id: r.id }, data: { categoryId } });
    placed++;
  }
  return placed;
}

/**
 * An Amazon refund takes the category of what was returned: an item of the same amount (within 2%,
 * at least 5¢) on an Amazon charge in the 120 days before it, else a whole charge of that amount.
 * Marked "item", so the merchant guess doesn't replace it. Returns how many were set.
 */
export async function categorizeAmazonRefunds(now = new Date()): Promise<number> {
  const refunds = (await prisma.bankTransaction.findMany({
    where: { amount: { gt: 0 }, kind: "NORMAL", pending: false, categorySource: { in: ["guess", "rule"] }, postedOn: { gte: new Date(now.getTime() - 180 * DAY) }, splits: { none: {} } },
    select: { id: true, postedOn: true, amount: true, merchant: true, description: true, accountId: true },
  })) as Array<{ id: string; postedOn: Date; amount: { toString(): string }; merchant: string; description: string; accountId: string }>;
  let set = 0;
  for (const r of refunds.filter((x) => AMAZON.test(`${x.merchant} ${x.description}`))) {
    const cents = toCentsOf(r.amount);
    const near = Math.max(5, Math.round(cents * 0.02));
    const window = { gte: new Date(r.postedOn.getTime() - 120 * DAY), lte: r.postedOn };
    const items = (await prisma.transactionSplit.findMany({
      where: { source: "amazon", categoryId: { not: null }, transaction: { postedOn: window, accountId: r.accountId } },
      select: { categoryId: true, amount: true, transaction: { select: { postedOn: true } } },
    })) as Array<{ categoryId: string; amount: { toString(): string }; transaction: { postedOn: Date } }>;
    const best = items
      .map((s) => ({ s, diff: Math.abs(-toCentsOf(s.amount) - cents), age: r.postedOn.getTime() - s.transaction.postedOn.getTime() }))
      .filter((x) => x.diff <= near)
      .sort((a, b) => a.diff - b.diff || a.age - b.age)[0];
    let categoryId = best?.s.categoryId ?? null;
    if (!categoryId) {
      const charge = (await prisma.bankTransaction.findFirst({
        where: { accountId: r.accountId, postedOn: window, amount: -cents / 100, kind: "NORMAL", categoryId: { not: null } },
        orderBy: { postedOn: "desc" },
        select: { categoryId: true, merchant: true, description: true },
      })) as { categoryId: string; merchant: string; description: string } | null;
      if (charge && AMAZON.test(`${charge.merchant} ${charge.description}`)) categoryId = charge.categoryId;
    }
    if (!categoryId) continue;
    await prisma.bankTransaction.update({ where: { id: r.id }, data: { categoryId, categorySource: "item" } });
    set++;
  }
  return set;
}
