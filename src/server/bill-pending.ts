/** Finds each unpaid bill's payment already in the bank feed but not recorded (src/lib/bill-pending.ts). */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { SPENDING_TYPES } from "@/lib/account-type";
import { matchPendingBills, type PendingCharge } from "@/lib/bill-pending";
import type { MonthEntry } from "./month";

const pad = (n: number) => String(n).padStart(2, "0");
const dueOf = (e: MonthEntry) => `${e.year}-${pad(e.month)}-${pad(Math.min(e.dueDay ?? 1, new Date(Date.UTC(e.year, e.month, 0)).getUTCDate()))}`;

/** Sets [pendingCharge] on unpaid bills (not income) whose payment is in the feed. */
export async function attachPendingCharges(entries: MonthEntry[], today: string): Promise<void> {
  const open = entries.filter((e) => e.kind !== "INCOME" && e.actualCents === null && !e.skipped && e.budgetedCents > 0 && dueOf(e) <= addDays(today, 7));
  if (!open.length) return;
  const ids = [...new Set(open.map((e) => e.lineItemId))];
  const earliest = open.map(dueOf).sort()[0];
  const [past, feed] = (await Promise.all([
    prisma.actualEntry.findMany({
      where: { lineItemId: { in: ids }, bankTransactionId: { not: null } },
      select: { lineItemId: true, bankTransaction: { select: { merchant: true, amount: true } } },
    }),
    prisma.bankTransaction.findMany({
      where: { postedOn: { gte: new Date(`${addDays(earliest, -7)}T00:00:00Z`) }, amount: { lt: 0 }, kind: { not: "IGNORED" }, actual: null, account: { hidden: false, type: { in: [...SPENDING_TYPES] } } },
      select: { id: true, merchant: true, amount: true, postedOn: true, pending: true },
    }),
  ])) as [
    Array<{ lineItemId: string; bankTransaction: { merchant: string; amount: { toString(): string } } | null }>,
    Array<{ id: string; merchant: string; amount: { toString(): string }; postedOn: Date; pending: boolean }>,
  ];
  const history = new Map<string, Array<{ merchant: string; cents: number }>>();
  for (const p of past) {
    if (!p.bankTransaction) continue;
    history.set(p.lineItemId, [...(history.get(p.lineItemId) ?? []), { merchant: p.bankTransaction.merchant, cents: Math.abs(toCents(p.bankTransaction.amount)) }]);
  }
  const key = (e: MonthEntry) => `${e.lineItemId}:${e.year}:${e.month}`;
  const found = matchPendingBills(
    open.map((e) => ({ key: key(e), lineItemId: e.lineItemId, dueOn: dueOf(e), budgetedCents: e.budgetedCents })),
    feed.map((t) => ({ id: t.id, merchant: t.merchant, cents: Math.abs(toCents(t.amount)), postedOn: t.postedOn.toISOString().slice(0, 10), pending: t.pending })),
    history,
  );
  for (const e of open) {
    const hit: PendingCharge | undefined = found.get(key(e));
    if (hit) e.pendingCharge = hit;
  }
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
