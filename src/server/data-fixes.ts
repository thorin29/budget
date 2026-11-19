/**
 * One-time fixes to data already saved, each run once (remembered in Settings) when the server
 * starts after the update that adds it.
 *
 *  - parkingTolls: a "Parking & tolls" category in the Fuel budget (getting around), with every
 *    toll and parking charge moved into it and its merchants remembered for later charges. They
 *    were landing in a general auto category, which counts as car repairs.
 *  - subscriptionsAreBills: a subscription is a charge that repeats on its own, so the separate
 *    Subscriptions budget goes away and its categories move to the bills group. A subscription
 *    charge not on the bill list then shows on the Money tab with "Make it a bill."
 */

import { prisma } from "@/lib/prisma";
import { merchantKey } from "@/lib/field-crypto";
import { isPeerPayment } from "@/lib/category-guess";

const DONE = "dataFixes";
const PARKING = "Parking & tolls";
/** Tolls, toll tags and parking, by merchant or the bank's description. */
export const PARKING_TOLLS = /\b(ntta|tolls?|toll ?tag|txtag|ez ?tag|e-?z ?pass|parking|parkwhiz|parkmobile|spothero)\b/i;

async function done(): Promise<string[]> {
  const row = (await prisma.setting.findUnique({ where: { key: DONE } })) as { value: unknown } | null;
  return Array.isArray(row?.value) ? (row!.value as string[]) : [];
}
async function mark(list: string[]): Promise<void> {
  await prisma.setting.upsert({ where: { key: DONE }, create: { key: DONE, value: list as never }, update: { value: list as never } });
}

async function parkingTolls(): Promise<number> {
  const rows = (await prisma.bankTransaction.findMany({
    where: { kind: "NORMAL", amount: { lt: 0 }, actual: null },
    select: { id: true, merchant: true, description: true, category: { select: { managedForOthers: true } } },
  })) as Array<{ id: string; merchant: string; description: string; category: { managedForOthers: boolean } | null }>;
  const hits = rows.filter((r) => !r.category?.managedForOthers && !isPeerPayment(r.merchant) && PARKING_TOLLS.test(`${r.merchant} ${r.description}`));
  if (!hits.length) return 0;
  const fuel = (await prisma.categoryGroup.findFirst({ where: { tier: "ESSENTIAL", name: { contains: "Fuel", mode: "insensitive" } }, select: { id: true } })) as { id: string } | null;
  const category = ((await prisma.category.findFirst({ where: { name: PARKING }, select: { id: true } })) ??
    (await prisma.category.create({ data: { name: PARKING, active: true, sortOrder: 0, groupId: fuel?.id ?? null }, select: { id: true } }))) as { id: string };
  const keys = new Set(hits.map((r) => merchantKey(r.merchant)));
  for (const key of keys) await prisma.categoryRule.upsert({ where: { merchantKey: key }, create: { merchantKey: key, categoryId: category.id }, update: { categoryId: category.id } });
  const ids = hits.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 1000) {
    await prisma.bankTransaction.updateMany({ where: { id: { in: ids.slice(i, i + 1000) } }, data: { categoryId: category.id, categorySource: "rule" } });
  }
  return ids.length;
}

async function subscriptionsAreBills(): Promise<number> {
  const subs = (await prisma.categoryGroup.findMany({ where: { tier: "FLEXIBLE", name: { equals: "Subscriptions", mode: "insensitive" } }, select: { id: true } })) as Array<{ id: string }>;
  if (!subs.length) return 0;
  const bills = (await prisma.categoryGroup.findFirst({ where: { tier: "BILLS" }, orderBy: { sortOrder: "asc" }, select: { id: true } })) as { id: string } | null;
  if (!bills) return 0;
  const moved = await prisma.category.updateMany({ where: { groupId: { in: subs.map((g) => g.id) } }, data: { groupId: bills.id } });
  await prisma.categoryGroup.deleteMany({ where: { id: { in: subs.map((g) => g.id) } } });
  return moved.count;
}

const FIXES: Array<[string, () => Promise<number>]> = [
  ["parkingTolls", parkingTolls],
  ["subscriptionsAreBills", subscriptionsAreBills],
];

export async function runDataFixes(): Promise<void> {
  const list = await done();
  for (const [name, fix] of FIXES) {
    if (list.includes(name)) continue;
    try {
      const n = await fix();
      list.push(name);
      await mark(list);
      if (n) console.log(`Data fix ${name}: ${n} changed.`);
    } catch (error) {
      console.error(`Data fix ${name}:`, error instanceof Error ? error.message : error);
    }
  }
}
