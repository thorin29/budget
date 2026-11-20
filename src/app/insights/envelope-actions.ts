"use server";

/** Budget actions: limits, the debt payment, and how categories are grouped. Each checks its caller first. */

import { revalidatePath } from "next/cache";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { NotFoundError, ValidationError } from "@/server/errors";
import { deleteGroup, resetGroups, resetLimits, saveGroup, setCategoryGroup, setDebtPayment, setLimits } from "@/server/envelopes";

export type EnvelopeState = { ok: true; message?: string } | { ok: false; message: string };

function failure(error: unknown): EnvelopeState {
  if (error instanceof ValidationError) return { ok: false, message: Object.values(error.issues).flat()[0] ?? error.message };
  if (error instanceof NotFoundError || error instanceof UnauthorizedError) return { ok: false, message: error.message };
  // RentCast and key problems carry a message meant for the person.
  if (error instanceof Error && (error.name === "BankFeedError" || error.name === "MissingKeyError")) return { ok: false, message: error.message };
  console.error("Envelope action failed:", error);
  return { ok: false, message: "Something went wrong" };
}

async function run(work: () => Promise<unknown>, message?: string): Promise<EnvelopeState> {
  try {
    await requireUser();
    await work();
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (error) {
    return failure(error);
  }
}

export async function setLimitsAction(limits: Record<string, number | null>): Promise<EnvelopeState> {
  return run(() => setLimits(limits), "Limits saved.");
}

export async function resetLimitsAction(): Promise<EnvelopeState> {
  return run(() => resetLimits(), "Limits are automatic again.");
}

export async function setCushionAction(cents: number | null): Promise<EnvelopeState> {
  const { setCushion } = await import("@/server/envelopes");
  return run(() => setCushion(cents), "Saved.");
}

export async function setDebtPaymentAction(cents: number | null): Promise<EnvelopeState> {
  return run(() => setDebtPayment(cents), "Saved.");
}

export async function saveGroupAction(input: { id?: string; name: string; tier: string }): Promise<EnvelopeState> {
  return run(() => saveGroup(input), "Saved.");
}

export async function deleteGroupAction(id: string): Promise<EnvelopeState> {
  return run(() => deleteGroup(String(id)), "Removed. Its categories need a budget again.");
}

export async function setCategoryGroupAction(categoryId: string, groupId: string | null): Promise<EnvelopeState> {
  return run(() => setCategoryGroup(String(categoryId), groupId ? String(groupId) : null));
}

export async function resetGroupsAction(): Promise<EnvelopeState> {
  return run(() => resetGroups(), "Budgets rebuilt from the suggested set.");
}

export async function addChargeAsBillAction(transactionId: string, name?: string): Promise<EnvelopeState> {
  const { addChargeAsBill } = await import("@/server/bill-from-charge");
  let made = "";
  const state = await run(async () => {
    made = (await addChargeAsBill(String(transactionId), name ? String(name) : undefined)).name;
  });
  return state.ok ? { ok: true, message: `Added ${made} as a monthly bill. Change it on Bills & income if anything's off.` } : state;
}

export async function saveLoanDetailsAction(lineItemId: string, balanceCents: number | null, aprBps: number | null, escrowCents: number | null = null): Promise<EnvelopeState> {
  const { saveLoanDetails } = await import("@/server/debt");
  return run(() => saveLoanDetails(String(lineItemId), balanceCents, aprBps, escrowCents), "Saved.");
}

export async function notALoanAction(lineItemId: string): Promise<EnvelopeState> {
  const { notALoan } = await import("@/server/debt");
  return run(() => notALoan(String(lineItemId)), "Won't ask about that one again.");
}

export async function addRepeatAsSubscriptionAction(key: string): Promise<EnvelopeState> {
  const { addRepeatAsSubscription } = await import("@/server/subscriptions");
  let name = "";
  const state = await run(async () => {
    name = (await addRepeatAsSubscription(String(key))).name;
  });
  return state.ok ? { ok: true, message: `${name} is a bill under Subscriptions & autopay.` } : state;
}

export async function notASubscriptionAction(key: string): Promise<EnvelopeState> {
  const { notASubscription } = await import("@/server/subscriptions");
  return run(() => notASubscription(String(key)), "Won't list it again.");
}

/** "This charge is that bill" from the Money tab's bill-category charges. */
export async function matchChargeToBillAction(transactionId: string, lineItemId: string, ym: string | null = null): Promise<EnvelopeState> {
  try {
    const user = await requireUser();
    const { matchChargeToBill } = await import("@/server/review");
    const { name, month } = await matchChargeToBill(String(transactionId), String(lineItemId), user.id, ym ? String(ym) : null);
    revalidatePath("/", "layout");
    return { ok: true, message: `Recorded as ${name}, ${month}` };
  } catch (error) {
    return failure(error);
  }
}

export async function saveOwnedAssetsAction(list: Array<{ id: string; name: string; cents: number }>): Promise<EnvelopeState> {
  const { saveOwnedAssets } = await import("@/server/net-worth");
  return run(() => saveOwnedAssets(list), "Saved.");
}

export async function saveHomeValueAction(address: string, apiKey: string | null): Promise<EnvelopeState> {
  const { saveHomeValueSetup } = await import("@/server/home-value");
  let msg = "Saved.";
  const state = await run(async () => {
    const v = await saveHomeValueSetup(String(address), apiKey ? String(apiKey) : null);
    msg = v.error ? `Saved, but RentCast said: ${v.error}` : v.valueCents ? `RentCast estimate: $${Math.round(v.valueCents / 100).toLocaleString("en-US")}` : "Saved.";
  });
  return state.ok ? { ok: true, message: msg } : state;
}

export async function refreshHomeValueAction(): Promise<EnvelopeState> {
  const { refreshHomeValue } = await import("@/server/home-value");
  let msg = "Up to date.";
  const state = await run(async () => {
    const v = await refreshHomeValue(true);
    msg = v?.error ? `RentCast said: ${v.error}` : "Updated.";
  });
  return state.ok ? { ok: true, message: msg } : state;
}
