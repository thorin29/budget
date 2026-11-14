"use server";

import { requireUser, type SessionUser } from "@/server/auth";
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

/** YYYY-MM-DD from a date input, as a UTC midnight. Empty means not given. */
function date(form: FormData, key: string): Date | undefined {
  const raw = str(form, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const value = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

async function run(
  _year: number,
  _month: number,
  work: (user: SessionUser) => Promise<void>,
): Promise<FormState> {
  try {
    // Every action checks its caller: a path-based gate cannot cover actions.
    const user = await requireUser();
    await work(user);
    // A payment moves the month, the projection and the year at once, and a
    // carried row belongs to a month other than the one on screen.
    revalidatePath("/", "layout");
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
  return run(year, month, async (user) => {
    await recordActual(
      str(form, "lineItemId"),
      year,
      month,
      parseCents(str(form, "amount")),
      undefined,
      date(form, "paidOn"),
      user.id,
    );
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
