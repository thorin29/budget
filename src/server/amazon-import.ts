/**
 * Amazon order history: splits each matched card charge into the categories of
 * the items in it (src/lib/amazon-orders.ts). The order file is read and
 * dropped; only the split amounts, their categories and the item names
 * (encrypted, as notes) are kept. Undone by removing the splits.
 */

import { prisma } from "@/lib/prisma";
import { toCents, toDecimalString } from "@/lib/money";
import { KINDS, matchCharges, parseOrderHistory, shipments, splitByItem, splitByKind, type ItemKind } from "@/lib/amazon-orders";
import { itemKeys, itemRules, ruleFor } from "./amazon-items";
import { ValidationError } from "./errors";

const AMAZON = /amazon|amzn|amz\b|amz\*|prime ?video|whole ?foods|wholefds/i;

export interface AmazonPreview {
  items: number;
  from: string | null;
  to: string | null;
  charges: number;
  matched: number;
  matchedCents: number;
  /** Charges in the same dates already split by an earlier file. */
  alreadySplit: number;
  /** By kind: how the matched spending would be shared. */
  kinds: Array<{ kind: ItemKind; name: string; cents: number }>;
}

async function plan(text: string) {
  let items;
  try {
    items = parseOrderHistory(text);
  } catch (error) {
    throw new ValidationError({ file: [error instanceof Error ? error.message : "Couldn't read the file"] });
  }
  if (!items.length) throw new ValidationError({ file: ["No orders in the file"] });
  const all = shipments(items);
  const dates = all.map((s) => s.date).sort();
  const from = new Date(Date.parse(`${dates[0]}T00:00:00Z`) - 3 * 86_400_000);
  const to = new Date(Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) + 10 * 86_400_000);
  const rows = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: from, lte: to }, amount: { lt: 0 }, kind: "NORMAL", account: { hidden: false } },
    select: { id: true, postedOn: true, amount: true, merchant: true, description: true, _count: { select: { splits: true } } },
  })) as Array<{ id: string; postedOn: Date; amount: { toString(): string }; merchant: string; description: string; _count: { splits: number } }>;
  const amazon = rows.filter((r) => AMAZON.test(r.merchant) || AMAZON.test(r.description));
  const open = amazon.filter((r) => r._count.splits === 0);
  const charges = open.map((r) => ({ id: r.id, postedOn: r.postedOn.toISOString().slice(0, 10), cents: -toCents(r.amount) }));
  const matches = matchCharges(all, charges);
  const centsOf = new Map(charges.map((c) => [c.id, c.cents]));
  return { items, matches, centsOf, amazon, alreadySplit: amazon.length - open.length, dates };
}

export async function previewAmazon(text: string): Promise<AmazonPreview> {
  const { items, matches, centsOf, amazon, alreadySplit, dates } = await plan(text);
  const byKind = new Map<ItemKind, number>();
  let matchedCents = 0;
  for (const m of matches) {
    const cents = centsOf.get(m.chargeId) ?? 0;
    matchedCents += cents;
    for (const p of splitByKind(cents, m.items)) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + p.cents);
  }
  return {
    items: items.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    charges: amazon.length,
    matched: matches.length,
    matchedCents,
    alreadySplit,
    kinds: [...byKind.entries()]
      .map(([kind, cents]) => ({ kind, name: KINDS.find((k) => k.kind === kind)?.name ?? "Needs a category", cents }))
      .sort((a, b) => b.cents - a.cents),
  };
}

/** The category each kind goes to: an existing one by name, else one made for it. */
export async function categoriesForKinds(kinds: Set<ItemKind>): Promise<Map<ItemKind, string>> {
  const existing = (await prisma.category.findMany({ where: { managedForOthers: false }, select: { id: true, name: true } })) as Array<{ id: string; name: string }>;
  const out = new Map<ItemKind, string>();
  for (const kind of kinds) {
    const k = KINDS.find((x) => x.kind === kind);
    if (!k) continue;
    const hit = existing.find((c) => k.matches.test(c.name.trim()));
    if (hit) {
      out.set(kind, hit.id);
      continue;
    }
    const made = (await prisma.category.upsert({ where: { name: k.name }, create: { name: k.name }, update: {}, select: { id: true, name: true } })) as { id: string; name: string };
    existing.push(made);
    out.set(kind, made.id);
  }
  return out;
}

export async function importAmazon(text: string): Promise<{ importId: string; charges: number; splits: number }> {
  const { matches, centsOf } = await plan(text);
  if (!matches.length) throw new ValidationError({ file: ["None of the orders matched a card charge. Bank history for those dates may not be loaded yet."] });
  const kinds = new Set<ItemKind>(matches.flatMap((m) => m.items.map((i) => i.kind)));
  const category = await categoriesForKinds(kinds);
  const rules = await itemRules();
  const importId = `amazon-${Date.now().toString(36)}`;
  let count = 0;
  for (const m of matches) {
    // One part per item, as the extension's sync does: a category fixed earlier for the item wins,
    // and an item we can't place gets none, so it shows under Needs a category.
    const data = splitByItem(centsOf.get(m.chargeId) ?? 0, m.items).map((p) => {
      const keys = itemKeys(p.item.name, p.item.productId);
      return {
        transactionId: m.chargeId,
        categoryId: ruleFor(rules, keys) ?? (p.item.kind === "other" ? null : (category.get(p.item.kind) ?? null)),
        amount: toDecimalString(-p.cents),
        note: p.item.name.slice(0, 500),
        source: "amazon",
        importId,
        itemKey: keys[0] ?? null,
      };
    });
    await prisma.$transaction(data.map((d) => prisma.transactionSplit.create({ data: d })));
    count += data.length;
  }
  return { importId, charges: matches.length, splits: count };
}

export async function amazonStatus(): Promise<{ charges: number; lastImportAt: Date | null }> {
  const [groups, last] = await Promise.all([
    prisma.transactionSplit.findMany({ where: { source: "amazon" }, distinct: ["transactionId"], select: { transactionId: true } }) as Promise<unknown[]>,
    prisma.transactionSplit.findFirst({ where: { source: "amazon" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) as Promise<{ createdAt: Date } | null>,
  ]);
  return { charges: groups.length, lastImportAt: last?.createdAt ?? null };
}

export async function removeAmazonSplits(): Promise<number> {
  const r = await prisma.transactionSplit.deleteMany({ where: { source: "amazon" } });
  return r.count;
}
