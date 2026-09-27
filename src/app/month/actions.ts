"use server";

import { revalidatePath } from "next/cache";
import { adjustMonth, clearActual, recordActual, recordBillsBalance } from "@/server/month";
import { ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";

export interface FormState {
  ok: boolean;
  message?: string;
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const int = (form: FormData, key: string) => Number(str(form, key));

async function run(
  year: number,
  month: number,
  work: () => Promise<void>,
): Promise<FormState> {
  try {
    await work();
    revalidatePath(`/month/${year}/${month}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      const first = Object.values(error.issues)[0]?.[0];
      return { ok: false, message: first ?? error.message };
    }
    if (error instanceof Error) return { ok: false, message: error.message };
    return { ok: false, message: "Something went wrong" };
  }
}

export async function recordActualAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const year = int(form, "year");
  const month = int(form, "month");
  return run(year, month, async () => {
    await recordActual(str(form, "lineItemId"), year, month, parseCents(str(form, "amount")));
  });
}

export async function clearActualAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const year = int(form, "year");
  const month = int(form, "month");
  return run(year, month, async () => {
    await clearActual(str(form, "lineItemId"), year, month);
  });
}

export async function adjustMonthAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const year = int(form, "year");
  const month = int(form, "month");
  const raw = str(form, "amount");
  const skipped = str(form, "skipped") === "true";

  return run(year, month, async () => {
    await adjustMonth(str(form, "lineItemId"), year, month, {
      amountCents: skipped || raw === "" ? null : parseCents(raw),
      skipped,
    });
  });
}

export async function recordBalanceAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const year = int(form, "year");
  const month = int(form, "month");
  return run(year, month, async () => {
    await recordBillsBalance(year, month, parseCents(str(form, "amount")));
  });
}
