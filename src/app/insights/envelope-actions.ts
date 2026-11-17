"use server";

/** Budget actions: guardrails, the debt payment, and how categories are grouped. Each checks its caller first. */

import { revalidatePath } from "next/cache";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { NotFoundError, ValidationError } from "@/server/errors";
import { deleteGroup, resetGroups, resetLimits, saveGroup, setCategoryGroup, setDebtPayment, setLimits } from "@/server/envelopes";

export type EnvelopeState = { ok: true; message?: string } | { ok: false; message: string };

function failure(error: unknown): EnvelopeState {
  if (error instanceof ValidationError) return { ok: false, message: Object.values(error.issues).flat()[0] ?? error.message };
  if (error instanceof NotFoundError || error instanceof UnauthorizedError) return { ok: false, message: error.message };
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
  return run(() => setLimits(limits), "Guardrails saved.");
}

export async function resetLimitsAction(): Promise<EnvelopeState> {
  return run(() => resetLimits(), "Guardrails are automatic again.");
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
