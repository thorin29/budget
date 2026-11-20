/**
 * What checking actually held on past days, worked back from the bank's current balance: before a
 * deposit it was less, before a payment more. Pending rows are left out (the bank's balance doesn't
 * count them yet). Used by the Cash chart (the line before today) and the Calendar (past days).
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { getSettings } from "./settings";

export interface PastDay {
  /** YYYY-MM-DD */
  date: string;
  /** Checking at the end of the day. */
  balanceCents: number;
  items: Array<{ label: string; cents: number }>;
}

export interface CheckingHistory {
  /** Every day from `from` through the day before today, oldest first. */
  days: PastDay[];
  /** Checking at the end of the day before `from`. */
  startCents: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

export async function checkingHistory(from: string, today: string): Promise<CheckingHistory | null> {
  if (from >= today) return { days: [], startCents: 0 };
  const settings = await getSettings();
  if (!settings.billsAccountId) return null;
  const bank = (await prisma.bankAccount.findFirst({
    where: { linkedAccountId: settings.billsAccountId, hidden: false },
    select: { id: true, balance: true },
  })) as { id: string; balance: { toString(): string } | null } | null;
  if (!bank || bank.balance === null) return null;
  const rows = (await prisma.bankTransaction.findMany({
    where: { accountId: bank.id, pending: false, postedOn: { gte: new Date(`${from}T00:00:00Z`) } },
    select: { postedOn: true, amount: true, merchant: true, description: true },
    orderBy: { postedOn: "asc" },
  })) as Array<{ postedOn: Date; amount: { toString(): string }; merchant: string | null; description: string }>;

  const byDay = new Map<string, Array<{ label: string; cents: number }>>();
  for (const r of rows) {
    const d = iso(r.postedOn);
    byDay.set(d, [...(byDay.get(d) ?? []), { label: r.merchant || r.description, cents: toCents(r.amount) }]);
  }
  // The balance now, less everything since `from`, is what it held before `from`.
  const since = rows.reduce((t, r) => t + toCents(r.amount), 0);
  const startCents = toCents(bank.balance) - since;
  const days: PastDay[] = [];
  let balance = startCents;
  for (let t = Date.parse(`${from}T00:00:00Z`); iso(new Date(t)) < today; t += DAY) {
    const d = iso(new Date(t));
    const items = byDay.get(d) ?? [];
    balance += items.reduce((s, i) => s + i.cents, 0);
    days.push({ date: d, balanceCents: balance, items });
  }
  return { days, startCents };
}
