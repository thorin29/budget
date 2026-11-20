"use server";

import { requireUser } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createLineItem, deleteLineItemForGood, getLineItem, mergeLineItem, updateLineItem } from "@/server/line-items";
import { changeUsualAmount, dismissAmountSuggestion, keepEarlierAmount, matchPastToPayments } from "@/server/bill-amounts";
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
    paidFromSurplus: str(form, "paidFromSurplus") === "true",
    autoRecord: str(form, "autoRecord") === "true",
    ...(form.has("paysCard") ? { paysCard: str(form, "paysCard") || "auto" } : {}),
    ...(form.has("payoffMode")
      ? str(form, "payoffMode") === "account"
        ? { payoffAccountId: str(form, "payoffAccountId") || null, payoffBalanceCents: null }
        : str(form, "payoffMode") === "balance" && str(form, "payoffBalance")
          ? { payoffAccountId: null, payoffBalanceCents: parseCents(str(form, "payoffBalance")), payoffAsOf: str(form, "payoffAsOf") || null }
          : { payoffAccountId: null, payoffBalanceCents: null }
      : {}),
    ...(form.has("payoffMode")
      ? str(form, "payoffMode") === "none"
        ? { payoffAprBps: null, payoffEscrowCents: null }
        : {
            payoffAprBps: str(form, "payoffApr") ? Math.round(Number(str(form, "payoffApr").replace(/[%\s]/g, "")) * 100) : null,
            payoffEscrowCents: str(form, "payoffEscrow") ? parseCents(str(form, "payoffEscrow")) : null,
          }
      : {}),
    ...(form.has("paydayNumber") ? { paydayNumber: Number(str(form, "paydayNumber") || 0) } : {}),
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
    await requireUser();
    await createLineItem(readForm(form));
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/", "layout");
  redirect("/line-items");
}

export async function updateLineItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const id = str(form, "id");
  try {
    await requireUser();
    const input = readForm(form);
    // A new usual amount applies from the month picked; the months before keep the old one.
    const from = str(form, "amountFrom");
    const before = await getLineItem(id);
    if (from && from !== "all" && input.plannedAmountCents !== before.plannedAmountCents) {
      await keepEarlierAmount(id, before.plannedAmountCents, from);
    }
    await updateLineItem(id, input);
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/", "layout");
  redirect("/line-items");
}

export async function deleteLineItemAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    await requireUser();
    // From the web it's gone for good; the phone's DELETE still only turns an item with history off.
    const to = form.get("chargesTo");
    await deleteLineItemForGood(str(form, "id"), typeof to === "string" && to ? to : null);
  } catch (error) {
    return toState(error);
  }
  revalidatePath("/", "layout");
  redirect("/line-items");
}

/** Small results for the buttons on Review and in a bill's payment history. */
export interface AmountState {
  ok: boolean;
  message?: string;
}
async function quick(work: () => Promise<string>): Promise<AmountState> {
  try {
    const message = await work();
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (error) {
    return toState(error);
  }
}

export async function changeUsualAmountAction(id: string, cents: number, from: string, escrowFollows: boolean, matchPast: boolean): Promise<AmountState> {
  return quick(async () => {
    await requireUser();
    await changeUsualAmount(String(id), Number(cents), String(from), Boolean(escrowFollows));
    const fixed = matchPast ? await matchPastToPayments(String(id)) : 0;
    return fixed ? `Updated, and ${fixed} past ${fixed === 1 ? "month" : "months"} set to what was paid.` : "Updated.";
  });
}

export async function matchPastToPaymentsAction(id: string): Promise<AmountState> {
  return quick(async () => {
    await requireUser();
    const n = await matchPastToPayments(String(id));
    return n ? `${n} past ${n === 1 ? "month" : "months"} set to what was paid.` : "Past months already match.";
  });
}

export async function dismissAmountAction(id: string, cents: number): Promise<AmountState> {
  return quick(async () => {
    await requireUser();
    await dismissAmountSuggestion(String(id), Number(cents));
    return "Hidden.";
  });
}

export async function mergeLineItemAction(fromId: string, intoId: string): Promise<AmountState> {
  return quick(async () => {
    await requireUser();
    const r = await mergeLineItem(String(fromId), String(intoId));
    const moved = [r.payments ? `${r.payments} ${r.payments === 1 ? "payment" : "payments"}` : "", r.months ? `${r.months} ${r.months === 1 ? "month's amount" : "months' amounts"}` : ""].filter(Boolean).join(" and ") || "nothing";
    const left = r.skipped ? ` ${r.skipped} left out: the other line already had ${r.skipped === 1 ? "that month" : "those months"}.` : "";
    return `Merged: moved ${moved}, and deleted the duplicate.${left}`;
  });
}
