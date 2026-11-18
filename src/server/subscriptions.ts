/**
 * Subscriptions & autopay: charges that happen on their own every month
 * (a streaming service, an app, a membership), as opposed to spending done
 * in person like fuel or groceries. They're bills in one category, rolled up
 * on the Money tab; repeating charges in the bank that aren't bills yet are
 * listed beside them so none slips by unnoticed.
 */

import { prisma } from "@/lib/prisma";
import { getReview, addRepeatAsBill, dismissRepeat, type RepeatCharge } from "./review";
import { addChargeAsBill } from "./bill-from-charge";

export const SUBSCRIPTIONS = "Subscriptions & autopay";

/** The category, made the first time it's needed, in the budget paid as bills. */
export async function subscriptionsCategory(): Promise<string> {
  const found = (await prisma.category.findFirst({ where: { name: { equals: SUBSCRIPTIONS, mode: "insensitive" } }, select: { id: true, groupId: true } })) as
    | { id: string; groupId: string | null }
    | null;
  const bills = (await prisma.categoryGroup.findFirst({ where: { tier: "BILLS" }, orderBy: { sortOrder: "asc" }, select: { id: true } })) as { id: string } | null;
  if (found) {
    if (!found.groupId && bills) await prisma.category.update({ where: { id: found.id }, data: { groupId: bills.id } });
    return found.id;
  }
  const made = (await prisma.category.create({ data: { name: SUBSCRIPTIONS, groupId: bills?.id ?? null }, select: { id: true } })) as { id: string };
  return made.id;
}

/** Repeating charges in the bank that aren't bills yet. */
export async function unbilledRepeats(): Promise<RepeatCharge[]> {
  return (await getReview()).repeats;
}

async function intoSubscriptions(lineItemId: string): Promise<void> {
  const categoryId = await subscriptionsCategory();
  await prisma.lineItem.update({ where: { id: lineItemId }, data: { categoryId, paysCardId: null, paysCardLocked: true } });
}

/** A repeating charge, by merchant, becomes a monthly bill in Subscriptions & autopay. */
export async function addRepeatAsSubscription(key: string): Promise<{ name: string }> {
  const made = await addRepeatAsBill(key);
  await intoSubscriptions(made.lineItemId);
  return { name: made.name };
}

/** One charge becomes a monthly bill in Subscriptions & autopay, with the charge as this month's payment. */
export async function addChargeAsSubscription(txnId: string): Promise<{ name: string }> {
  const made = await addChargeAsBill(txnId);
  await intoSubscriptions(made.lineItemId);
  return { name: made.name };
}

export async function notASubscription(key: string): Promise<void> {
  await dismissRepeat(key);
}
