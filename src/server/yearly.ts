/**
 * Yearly charges coming up, from bank history (src/lib/yearly-charges.ts).
 * A merchant already tied to a bill is planned for, so it isn't listed; one
 * the person turned down stays hidden. "Add as a yearly bill" plans it.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { merchantKey } from "@/lib/field-crypto";
import { SPENDING_TYPES, type AccountType } from "@/lib/account-type";
import { upcomingYearly, type UpcomingCharge } from "@/lib/yearly-charges";
import { createLineItem } from "./line-items";
import { getSettings } from "./settings";
import { NotFoundError, ValidationError } from "./errors";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export interface Upcoming extends UpcomingCharge {
  /** Paid from checking (so a bill for it comes out of the bills account) rather than a card. */
  fromChecking: boolean;
}

export async function getUpcoming(today = localToday(), horizonDays = 45): Promise<Upcoming[]> {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 800 * DAY);
  const rows = (await prisma.bankTransaction.findMany({
    where: { postedOn: { gte: since }, pending: false, kind: "NORMAL", amount: { lt: 0 }, account: { hidden: false } },
    select: {
      postedOn: true, amount: true, merchant: true, description: true,
      account: { select: { type: true } },
      category: { select: { name: true, managedForOthers: true } },
    },
  })) as Array<{ postedOn: Date; amount: { toString(): string }; merchant: string; description: string; account: { type: AccountType }; category: { name: string; managedForOthers: boolean } | null }>;

  const fromChecking = new Map<string, boolean>();
  const charges = rows
    .filter((r) => SPENDING_TYPES.includes(r.account.type) && !r.category?.managedForOthers && r.merchant.trim())
    .map((r) => {
      const key = merchantKey(r.merchant);
      fromChecking.set(key, r.account.type === "CHECKING");
      return { key, merchant: r.merchant.trim(), description: r.description, postedOn: iso(r.postedOn), cents: -toCents(r.amount), categoryName: r.category?.name ?? null };
    });

  const [rules, dismissals] = await Promise.all([
    prisma.billRule.findMany({ select: { merchantKey: true } }) as Promise<Array<{ merchantKey: string }>>,
    prisma.reviewDismissal.findMany({ where: { kind: "yearly" }, select: { key: true } }) as Promise<Array<{ key: string }>>,
  ]);
  const planned = new Set(rules.map((r) => r.merchantKey));
  const hidden = new Set(dismissals.map((d) => d.key));
  return upcomingYearly(charges, today, horizonDays)
    .filter((u) => !planned.has(u.key) && !hidden.has(u.key))
    .map((u) => ({ ...u, fromChecking: fromChecking.get(u.key) ?? false }));
}

/** Plans a yearly charge: a once-a-year bill in its month, tied to its merchant. */
export async function addYearlyBill(key: string): Promise<{ lineItemId: string; name: string }> {
  if (!/^[0-9a-f]{32}$/.test(key)) throw new ValidationError({ key: ["Unknown charge"] });
  const found = (await getUpcoming(undefined, 120)).find((u) => u.key === key);
  if (!found) throw new NotFoundError("Yearly charge");
  const { billsAccountId } = await getSettings();
  const month = Number(found.expectedOn.slice(5, 7));
  const item = await createLineItem({
    name: found.merchant.slice(0, 80),
    kind: "BILL",
    plannedAmountCents: found.cents,
    dueDay: Math.min(Number(found.expectedOn.slice(8, 10)), 28),
    paidFromId: found.fromChecking ? billsAccountId : null,
    scheduleKind: "ANNUAL",
    anchorMonth: month,
  });
  await prisma.billRule.upsert({
    where: { lineItemId_merchantKey: { lineItemId: item.id, merchantKey: key } },
    create: { lineItemId: item.id, merchantKey: key },
    update: {},
  });
  return { lineItemId: item.id, name: item.name };
}

/** Stops listing a merchant as a yearly charge. */
export async function dismissYearly(key: string): Promise<void> {
  if (!/^[0-9a-f]{32}$/.test(key)) throw new ValidationError({ key: ["Unknown charge"] });
  await prisma.reviewDismissal.upsert({ where: { kind_key: { kind: "yearly", key } }, create: { kind: "yearly", key }, update: {} });
}
