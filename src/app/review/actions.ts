"use server";

/** Review list actions. Each checks its caller first. */

import { revalidatePath } from "next/cache";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { NotFoundError, ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";
import { addRepeatAsBill, confirmMatch, dismissMatch, dismissRepeat } from "@/server/review";

export type ReviewState = { ok: true; message?: string } | { ok: false; message: string };

function failure(error: unknown): ReviewState {
  if (error instanceof ValidationError) return { ok: false, message: Object.values(error.issues).flat()[0] ?? error.message };
  if (error instanceof NotFoundError || error instanceof UnauthorizedError) return { ok: false, message: error.message };
  if (error instanceof Error && /amount/i.test(error.message)) return { ok: false, message: "Enter an amount" };
  console.error("Review action failed:", error);
  return { ok: false, message: "Something went wrong" };
}

const done = () => revalidatePath("/", "layout");

/** The confirm step: the person has seen and accepted (or changed) the amount and date. */
export async function confirmMatchAction(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  try {
    const user = await requireUser();
    const raw = String(form.get("paidOn") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, message: "Enter the date it was paid" };
    await confirmMatch({
      lineItemId: String(form.get("lineItemId") ?? ""),
      year: Number(form.get("year")),
      month: Number(form.get("month")),
      txnId: String(form.get("txnId") ?? ""),
      amountCents: parseCents(String(form.get("amount") ?? "")),
      paidOn: new Date(`${raw}T00:00:00Z`),
      userId: user.id,
    });
    done();
    return { ok: true, message: "Recorded." };
  } catch (error) {
    return failure(error);
  }
}

export async function dismissMatchAction(lineItemId: string, txnId: string): Promise<ReviewState> {
  try {
    await requireUser();
    await dismissMatch(String(lineItemId), String(txnId));
    done();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function addRepeatAction(key: string): Promise<ReviewState> {
  try {
    await requireUser();
    const item = await addRepeatAsBill(String(key));
    done();
    return { ok: true, message: `Added “${item.name}” as a monthly bill.` };
  } catch (error) {
    return failure(error);
  }
}

export async function dismissRepeatAction(key: string): Promise<ReviewState> {
  try {
    await requireUser();
    await dismissRepeat(String(key));
    done();
    return { ok: true, message: "Won't ask again." };
  } catch (error) {
    return failure(error);
  }
}
