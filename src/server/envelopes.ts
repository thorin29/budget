/**
 * Budgets: groups of categories, each a kind (bills, essential, flexible or
 * unplanned) with an optional monthly limit. The month's plan itself is
 * src/server/month-plan.ts. A starting set is made from the category names.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isIncomeCategory } from "@/lib/category-guess";
import type { GroupTier } from "@/lib/month-plan";
import { DEFAULT_GROUPS, OTHER_GROUP, defaultGroupFor } from "@/lib/envelope-defaults";
import { NotFoundError, ValidationError } from "./errors";
import { SETTING_KEYS } from "@/lib/settings";

const KEY_DEBT = "debtMonthlyCents";
const KEY_CUSHION = "cushionCents";
const KEY_SEEDED = "envelopesSeededAt";
const KEY_RESERVE = "unplannedReserveCents";
const KEY_EXTRA = "extraIncomeToDebt";
const KEY_PLACED = "envelopesPlacedAt";

type GroupRow = { id: string; name: string; tier: GroupTier; sortOrder: number; limitCents: number | null };

async function setting<T>(key: string): Promise<T | null> {
  const row = (await prisma.setting.findUnique({ where: { key } })) as { value: unknown } | null;
  return row && row.value !== null ? (row.value as T) : null;
}
async function saveSetting(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
}

/** The monthly debt payment the person set, or null for automatic. */
export async function debtSetting(): Promise<number | null> {
  return setting<number>(KEY_DEBT);
}

/**
 * The starting budgets, made once from the category names in use; after
 * that, categories created since the last look are placed the same way.
 */
export async function ensureGroups(): Promise<void> {
  const seededAt = await setting<string>(KEY_SEEDED);
  const placedAt = (await setting<string>(KEY_PLACED)) ?? seededAt;
  const now = new Date().toISOString();
  const categories = (await prisma.category.findMany({
    where: { groupId: null, managedForOthers: false, ...(placedAt ? { createdAt: { gt: new Date(placedAt) } } : {}) },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  const wanted = new Map<string, string[]>();
  for (const c of categories) {
    if (isIncomeCategory(c.name)) continue;
    const group = defaultGroupFor(c.name);
    if (group) wanted.set(group, [...(wanted.get(group) ?? []), c.id]);
  }
  if (wanted.size) {
    const existing = (await prisma.categoryGroup.findMany({ select: { id: true, name: true } })) as Array<{ id: string; name: string }>;
    const byName = new Map(existing.map((g) => [g.name, g.id]));
    for (const [name, ids] of wanted) {
      let id = byName.get(name);
      // After the first time, only groups that still exist take new categories: a removed group stays removed.
      if (!id && !seededAt) {
        const d = DEFAULT_GROUPS.find((g) => g.name === name)!;
        const made = (await prisma.categoryGroup.create({
          data: { name, tier: d.tier, sortOrder: DEFAULT_GROUPS.indexOf(d) },
          select: { id: true },
        })) as { id: string };
        id = made.id;
      }
      if (id) await prisma.category.updateMany({ where: { id: { in: ids } }, data: { groupId: id } });
    }
  }
  if (!seededAt) await saveSetting(KEY_SEEDED, now);
  await saveSetting(KEY_PLACED, now);
}

// ---------------------------------------------------------------- changes

const cents = z.number().int().min(0).max(100_000_000);

/** Monthly limits by group id; null puts a group back on automatic. */
export async function setLimits(input: unknown): Promise<void> {
  const parsed = z.record(z.string(), cents.nullable()).safeParse(input);
  if (!parsed.success) throw new ValidationError({ limits: ["Each limit is an amount, or empty for automatic"] });
  for (const [id, limitCents] of Object.entries(parsed.data)) {
    if (id === OTHER_GROUP.id) continue;
    await prisma.categoryGroup.updateMany({ where: { id }, data: { limitCents } });
  }
}

export async function resetLimits(): Promise<void> {
  await prisma.categoryGroup.updateMany({ data: { limitCents: null } });
}

/** What goes to the 0% debt each month; null for automatic (the bill for that card). */
/** The least checking should keep once every card and bill is paid; 0 when not set. */
/**
 * The checking cushion: one amount, used by Cash, Budget and the projection's floor. It used to be
 * two settings ("Checking cushion" and Planning's "Keep a floor of"); the older floor stands in
 * until a cushion is saved.
 */
export async function cushionSetting(): Promise<number> {
  return (await setting<number>(KEY_CUSHION)) ?? (await setting<number>(SETTING_KEYS.buffer)) ?? 0;
}

export async function setCushion(value: number | null): Promise<void> {
  if (value !== null && !cents.safeParse(value).success) throw new ValidationError({ cushion: ["Enter an amount"] });
  await saveSetting(KEY_CUSHION, value ?? 0);
  // The projection reads the floor from Planning's settings: kept the same.
  await saveSetting(SETTING_KEYS.buffer, value ?? 0);
}

/** Set aside each month for unplanned costs (medical, repairs, fees); 0 for none. */
export async function reserveSetting(): Promise<number> {
  return (await setting<number>(KEY_RESERVE)) ?? 0;
}
export async function setReserve(value: number | null): Promise<void> {
  if (value !== null && !cents.safeParse(value).success) throw new ValidationError({ reserve: ["Enter an amount"] });
  await saveSetting(KEY_RESERVE, value ?? 0);
}

/** Budgets come from a normal month's income; bonuses and extra paychecks go to the 0% card. */
export async function extraToDebtSetting(): Promise<boolean> {
  return (await setting<boolean>(KEY_EXTRA)) === true;
}
export async function setExtraToDebt(on: boolean): Promise<void> {
  await saveSetting(KEY_EXTRA, on === true);
}

export async function setDebtPayment(value: number | null): Promise<void> {
  if (value !== null && !cents.safeParse(value).success) throw new ValidationError({ debt: ["Enter an amount"] });
  await saveSetting(KEY_DEBT, value);
}

const groupInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name it").max(40),
  tier: z.enum(["ESSENTIAL", "FLEXIBLE", "UNPLANNED", "BILLS"]),
});

export async function saveGroup(input: unknown): Promise<{ id: string }> {
  const parsed = groupInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
  const { id, name, tier } = parsed.data;
  const clash = (await prisma.categoryGroup.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) }, select: { id: true } })) as { id: string } | null;
  if (clash) throw new ValidationError({ name: ["There's already a budget with that name"] });
  if (!id) {
    const last = (await prisma.categoryGroup.aggregate({ _max: { sortOrder: true } })) as { _max: { sortOrder: number | null } };
    return (await prisma.categoryGroup.create({ data: { name, tier, sortOrder: (last._max.sortOrder ?? 0) + 1 }, select: { id: true } })) as { id: string };
  }
  const done = await prisma.categoryGroup.updateMany({ where: { id }, data: { name, tier, ...(tier === "UNPLANNED" || tier === "BILLS" ? { limitCents: null } : {}) } });
  if (!done.count) throw new NotFoundError("Budget");
  return { id };
}

/** Starts over: removes every envelope and makes the suggested set again from the categories. */
export async function resetGroups(): Promise<void> {
  await prisma.categoryGroup.deleteMany({});
  await prisma.setting.deleteMany({ where: { key: { in: [KEY_SEEDED, KEY_PLACED] } } });
  await ensureGroups();
}

/** Removes a budget; its categories need a budget again. */
export async function deleteGroup(id: string): Promise<void> {
  await prisma.categoryGroup.deleteMany({ where: { id } });
}

export async function setCategoryGroup(categoryId: string, groupId: string | null): Promise<void> {
  if (groupId) {
    const group = await prisma.categoryGroup.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!group) throw new ValidationError({ groupId: ["Pick a budget"] });
  }
  const done = await prisma.category.updateMany({ where: { id: categoryId }, data: { groupId } });
  if (!done.count) throw new NotFoundError("Category");
}

export interface EnvelopeSetup {
  groups: Array<{ id: string; name: string; tier: GroupTier; limitCents: number | null; categories: Array<{ id: string; name: string }> }>;
  ungrouped: Array<{ id: string; name: string }>;
}

export async function getEnvelopeSetup(): Promise<EnvelopeSetup> {
  await ensureGroups();
  const [groups, categories] = await Promise.all([
    prisma.categoryGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) as Promise<GroupRow[]>,
    prisma.category.findMany({ where: { managedForOthers: false, active: true }, select: { id: true, name: true, groupId: true }, orderBy: { name: "asc" } }) as Promise<Array<{ id: string; name: string; groupId: string | null }>>,
  ]);
  const mine = categories.filter((c) => !isIncomeCategory(c.name));
  return {
    groups: groups.map((g) => ({
      id: g.id, name: g.name, tier: g.tier === "PLANNED" ? "UNPLANNED" : g.tier, limitCents: g.limitCents,
      categories: mine.filter((c) => c.groupId === g.id).map((c) => ({ id: c.id, name: c.name })),
    })),
    ungrouped: mine.filter((c) => !c.groupId).map((c) => ({ id: c.id, name: c.name })),
  };
}

/** Every category, for the list in Setup: its budget, whether it's money for others, and whether it's turned off. */
export async function allCategories(): Promise<Array<{ id: string; name: string; budget: string | null; forOthers: boolean; active: boolean }>> {
  const rows = (await prisma.category.findMany({
    select: { id: true, name: true, active: true, managedForOthers: true, group: { select: { name: true } } },
    orderBy: { name: "asc" },
  })) as Array<{ id: string; name: string; active: boolean; managedForOthers: boolean; group: { name: string } | null }>;
  return rows.map((r) => ({ id: r.id, name: r.name, budget: r.group?.name ?? null, forOthers: r.managedForOthers, active: r.active }));
}

/** For categories without a budget: how much they've been used in the last year, and the latest charges. */
export async function categoryUsage(ids: string[]): Promise<Record<string, { count: number; cents: number; latest: Array<{ date: string; merchant: string; cents: number }> }>> {
  if (!ids.length) return {};
  const rows = (await prisma.bankTransaction.findMany({
    where: { categoryId: { in: ids }, postedOn: { gte: new Date(Date.now() - 365 * 86_400_000) } },
    select: { categoryId: true, postedOn: true, merchant: true, amount: true },
    orderBy: { postedOn: "desc" },
  })) as Array<{ categoryId: string; postedOn: Date; merchant: string; amount: { toString(): string } }>;
  const out: Record<string, { count: number; cents: number; latest: Array<{ date: string; merchant: string; cents: number }> }> = {};
  for (const id of ids) out[id] = { count: 0, cents: 0, latest: [] };
  for (const r of rows) {
    const u = out[r.categoryId];
    const cents = Math.round(Number(r.amount.toString()) * 100);
    u.count += 1;
    u.cents += cents;
    if (u.latest.length < 3) u.latest.push({ date: r.postedOn.toISOString().slice(0, 10), merchant: r.merchant, cents });
  }
  return out;
}
