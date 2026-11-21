/**
 * Marking a transaction as money moving between your own accounts by hand (a payment to a loan whose
 * account isn't in the feed, say). A hand-marked transfer points at itself as its other side, so the
 * transfer refresh after each sync keeps it instead of resetting it as a transfer with no partner.
 */

import { prisma } from "@/lib/prisma";
import { NotFoundError } from "./errors";

export async function setTransfer(txnId: string, on: boolean): Promise<void> {
  const row = (await prisma.bankTransaction.findUnique({ where: { id: txnId }, select: { id: true, kind: true, transferOfId: true } })) as { id: string; kind: string; transferOfId: string | null } | null;
  if (!row) throw new NotFoundError("That transaction is gone");
  if (on) {
    await prisma.bankTransaction.update({ where: { id: txnId }, data: { kind: "TRANSFER", transferOfId: txnId } });
    return;
  }
  // Undo: both sides go back to normal when it was a pair.
  const ids = [txnId, ...(row.transferOfId && row.transferOfId !== txnId ? [row.transferOfId] : [])];
  await prisma.bankTransaction.updateMany({ where: { id: { in: ids } }, data: { kind: "NORMAL", transferOfId: null } });
}

/** Many at once (the changes file). */
export async function markTransfers(ids: string[]): Promise<void> {
  for (const id of ids) await prisma.bankTransaction.update({ where: { id }, data: { kind: "TRANSFER", transferOfId: id } });
}
