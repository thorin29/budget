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
