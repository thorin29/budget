/**
 * Cards planned by statement cycle: an option for a card whose cycle is far off the month, that
 * carries bills, or that carries a big balance. The Payments page shows each one's cycle beside
 * the month, set out the same way.
 */

import { prisma } from "@/lib/prisma";

const KEY = "cyclePlanCards";

export async function cyclePlanCards(): Promise<Set<string>> {
  const row = (await prisma.setting.findUnique({ where: { key: KEY } })) as { value: unknown } | null;
  return new Set(Array.isArray(row?.value) ? (row.value as unknown[]).filter((v): v is string => typeof v === "string") : []);
}

export async function setCyclePlan(cardId: string, on: boolean): Promise<void> {
  const ids = await cyclePlanCards();
  if (on) ids.add(cardId);
  else ids.delete(cardId);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: [...ids] as never }, update: { value: [...ids] as never } });
}
