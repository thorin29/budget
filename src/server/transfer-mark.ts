/**
 * Marking a transaction as money moving between your own accounts by hand (a payment to a loan whose
 * account isn't in the feed, say, or money a family member sends from their account). A hand-marked
 * transfer points at itself as its other side, so the transfer refresh after each sync keeps it
 * instead of resetting it as a transfer with no partner.
 *
 * "All from this merchant" remembers the merchant: everything from it, now and after each sync, is
 * marked too (applyTransferRules). Turning a transfer back off forgets the merchant.
 */

import { prisma } from "@/lib/prisma";
import { merchantKey } from "@/lib/field-crypto";
import { isPeerPayment } from "@/lib/category-guess";
import { NotFoundError, ValidationError } from "./errors";

const KEY = "transferRules";

async function rules(): Promise<Set<string>> {
  const row = (await prisma.setting.findUnique({ where: { key: KEY } })) as {
    value: unknown;
  } | null;
  return new Set(
    Array.isArray(row?.value)
      ? (row.value as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : [],
  );
}

async function saveRules(keys: Set<string>): Promise<void> {
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: [...keys] as never },
    update: { value: [...keys] as never },
  });
}

export async function setTransfer(
  txnId: string,
  on: boolean,
  forMerchant = false,
): Promise<number> {
  const row = (await prisma.bankTransaction.findUnique({
    where: { id: txnId },
    select: { id: true, kind: true, transferOfId: true, merchant: true },
  })) as {
    id: string;
    kind: string;
    transferOfId: string | null;
    merchant: string;
  } | null;
  if (!row) throw new NotFoundError("That transaction is gone");
  const key = merchantKey(row.merchant);
  if (on) {
    await prisma.bankTransaction.update({
      where: { id: txnId },
      data: { kind: "TRANSFER", transferOfId: txnId },
    });
    if (!forMerchant) return 0;
    if (isPeerPayment(row.merchant))
      throw new ValidationError({
        transfer: [
          "Payment apps carry unrelated payments, so mark those one at a time",
        ],
      });
    const keys = await rules();
    keys.add(key);
    await saveRules(keys);
    return applyTransferRules();
  }
  // Undo: both sides go back to normal when it was a pair, and the merchant is forgotten.
  const ids = [
    txnId,
    ...(row.transferOfId && row.transferOfId !== txnId
      ? [row.transferOfId]
      : []),
  ];
  await prisma.bankTransaction.updateMany({
    where: { id: { in: ids } },
    data: { kind: "NORMAL", transferOfId: null },
  });
  const keys = await rules();
  if (keys.delete(key)) await saveRules(keys);
  return 0;
}

/** Marks every transaction from a remembered merchant as a transfer (one set by hand to a category stays). Returns how many changed. */
export async function applyTransferRules(): Promise<number> {
  const keys = await rules();
  if (!keys.size) return 0;
  const rows = (await prisma.bankTransaction.findMany({
    where: { kind: "NORMAL", categorySource: { not: "person" } },
    select: { id: true, merchant: true },
  })) as Array<{ id: string; merchant: string }>;
  const hits = rows.filter((r) => keys.has(merchantKey(r.merchant)));
  for (const r of hits)
    await prisma.bankTransaction.update({
      where: { id: r.id },
      data: { kind: "TRANSFER", transferOfId: r.id, categoryId: null },
    });
  return hits.length;
}

/** Many at once (the changes file). */
export async function markTransfers(ids: string[]): Promise<void> {
  for (const id of ids)
    await prisma.bankTransaction.update({
      where: { id },
      data: { kind: "TRANSFER", transferOfId: id },
    });
}
