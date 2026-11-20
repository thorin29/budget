/**
 * Where each spending account's bank history starts. Months before an account's first transaction
 * are missing its spending, so pages can mark them as partial instead of looking like cheap months.
 */

import { prisma } from "@/lib/prisma";
import { SPENDING_TYPES, displayAccountName, type AccountType } from "@/lib/account-type";

export async function historyStarts(): Promise<Array<{ id: string; name: string; firstMonth: string }>> {
  const accounts = (await prisma.bankAccount.findMany({
    where: { hidden: false },
    select: { id: true, name: true, nickname: true, type: true },
  })) as Array<{ id: string; name: string; nickname: string | null; type: AccountType }>;
  const spending = accounts.filter((a) => SPENDING_TYPES.includes(a.type));
  if (!spending.length) return [];
  const firsts = await Promise.all(
    spending.map(async (a) => {
      const t = (await prisma.bankTransaction.findFirst({ where: { accountId: a.id }, orderBy: { postedOn: "asc" }, select: { postedOn: true } })) as { postedOn: Date } | null;
      return { accountId: a.id, _min: { postedOn: t?.postedOn ?? null } };
    }),
  );
  const byId = new Map(spending.map((a) => [a.id, a]));
  return firsts
    .filter((f) => f._min.postedOn)
    .map((f) => {
      const a = byId.get(f.accountId)!;
      return { id: a.id, name: a.nickname || displayAccountName(a.name), firstMonth: f._min.postedOn!.toISOString().slice(0, 7) };
    })
    .sort((x, y) => x.firstMonth.localeCompare(y.firstMonth));
}
