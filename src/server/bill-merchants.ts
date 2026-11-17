/** Merchants whose every charge pays a bill (set from the Uncategorized sorter). */

import { prisma } from "@/lib/prisma";
import { merchantKey } from "@/lib/field-crypto";

export async function billMerchantKeys(): Promise<Set<string>> {
  const rows = (await prisma.billRule.findMany({ where: { coversAll: true }, select: { merchantKey: true } })) as Array<{ merchantKey: string }>;
  return new Set(rows.map((r) => r.merchantKey));
}

/** A test for "this charge pays a bill": linked to one, or from a merchant that always does. */
export async function billCharge(): Promise<(row: { merchant: string; actual: unknown }) => boolean> {
  const keys = await billMerchantKeys();
  if (!keys.size) return (row) => !!row.actual;
  return (row) => !!row.actual || keys.has(merchantKey(row.merchant));
}
