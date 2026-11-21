"use server";

/** Payments page actions. Each checks its caller first. */

import { revalidatePath } from "next/cache";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { NotFoundError, ValidationError } from "@/server/errors";
import { setPlannedPayment } from "@/server/planned-payments";
import { adjustMonth } from "@/server/month";
import { prisma } from "@/lib/prisma";

export type PayState = { ok: true; message?: string } | { ok: false; message: string };

async function run(work: () => Promise<unknown>, message?: string): Promise<PayState> {
  try {
    await requireUser();
    await work();
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, message: Object.values(error.issues).flat()[0] ?? error.message };
    if (error instanceof NotFoundError || error instanceof UnauthorizedError) return { ok: false, message: error.message };
    console.error("Payment action failed:", error);
    return { ok: false, message: "Something went wrong" };
  }
}

/**
 * Sets (or with null clears) the payment for [key]. A 0% payment or a bill also gets that month's
 * amount on the Tracker; a card statement's line reads it from the setting.
 */
export async function setPaymentAction(key: string, cents: number | null, on: string | null): Promise<PayState> {
  return run(async () => {
    const k = String(key);
    const value = cents === null || on === null ? null : { cents: Math.round(Number(cents)), on: String(on) };
    await setPlannedPayment(k, value);
    const [kind, id, due] = k.split(":");
    const [y, m] = [Number(due.slice(0, 4)), Number(due.slice(5, 7))];
    let lineItemId: string | null = null;
    if (kind === "bill") lineItemId = id;
    if (kind === "debt") {
      const card = (await prisma.bankAccount.findUnique({ where: { id }, select: { linkedAccountId: true } })) as { linkedAccountId: string | null } | null;
      const line = card?.linkedAccountId
        ? ((await prisma.lineItem.findFirst({ where: { paysCardId: card.linkedAccountId, active: true }, select: { id: true } })) as { id: string } | null)
        : null;
      lineItemId = line?.id ?? null;
    }
    if (lineItemId) await adjustMonth(lineItemId, y, m, { amountCents: value ? value.cents : null, skipped: false });
  }, cents === null ? "Cleared." : "Payment set.");
}

export async function setBudgetAction(groupId: string, cents: number): Promise<PayState> {
  const { setLimits } = await import("@/server/envelopes");
  return run(() => setLimits({ [String(groupId)]: Math.round(Number(cents)) }), "Budget set.");
}

export async function snoozeOverAction(groupId: string, limitCents: number): Promise<PayState> {
  const { snoozeOver } = await import("@/server/budget-changes");
  return run(() => snoozeOver(String(groupId), Math.round(Number(limitCents))), "Hidden for 3 months");
}
