"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createLineItem, deleteLineItem, updateLineItem } from "@/server/line-items";
import { ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";

export interface FormState {
  ok: boolean;
  message?: string;
  issues?: Record<string, string[]>;
}

const str = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();
const num = (form: FormData, key: string): number | null => {
  const raw = str(form, key);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

function readForm(form: FormData) {
  const amount = str(form, "plannedAmount");

  return {
    name: str(form, "name"),
    kind: str(form, "kind") as never,
    categoryId: str(form, "categoryId") || null,
    paidFromId: str(form, "paidFromId") || null,
    chargedToId: str(form, "chargedToId") || null,
    payScheduleId: str(form, "payScheduleId") || null,
    plannedAmountCents: amount ? parseCents(amount) : 0,
    dueDay: num(form, "dueDay"),
    periodAssignment: (str(form, "periodAssignment") || "AUTO") as never,
    scheduleKind: (str(form, "scheduleKind") || "MONTHLY") as never,
    anchorMonth: num(form, "anchorMonth") ?? 1,
    months: form.getAll("months").map((m) => Number(m)).filter(Number.isFinite),
    onlyYear: num(form, "onlyYear"),
    startYear: num(form, "startYear"),
    startMonth: num(form, "startMonth"),
    endYear: num(form, "endYear"),
    endMonth: num(form, "endMonth"),
    paymentUrl: str(form, "paymentUrl") || null,
    notes: str(form, "notes") || null,
    active: str(form, "active") !== "false",
  };
}

function toState(error: unknown): FormState {
  if (error instanceof ValidationError) {
    return { ok: false, message: error.message, issues: error.issues };
  }
  if (error instanceof Error) return { ok: false, message: error.message };
  return { ok: false, message: "Something went wrong" };
}

export async function createLineItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await createLineItem(readForm(form));
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/line-items");
  redirect("/line-items");
}

export async function updateLineItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const id = str(form, "id");
  try {
    await updateLineItem(id, readForm(form));
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/line-items");
  redirect("/line-items");
}

export async function deleteLineItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await deleteLineItem(str(form, "id"));
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/line-items");
  return { ok: true };
}
