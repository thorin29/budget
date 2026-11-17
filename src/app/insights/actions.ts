"use server";

/** Insights actions: planning or hiding a yearly charge. Each checks its caller first. */

import { revalidatePath } from "next/cache";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { NotFoundError, ValidationError } from "@/server/errors";
import { addYearlyBill, dismissYearly } from "@/server/yearly";

export type InsightState = { ok: true; message?: string } | { ok: false; message: string };

function failure(error: unknown): InsightState {
  if (error instanceof ValidationError) return { ok: false, message: Object.values(error.issues).flat()[0] ?? error.message };
  if (error instanceof NotFoundError || error instanceof UnauthorizedError) return { ok: false, message: error.message };
  console.error("Insights action failed:", error);
  return { ok: false, message: "Something went wrong" };
}

export async function addYearlyAction(key: string): Promise<InsightState> {
  try {
    await requireUser();
    const item = await addYearlyBill(String(key));
    revalidatePath("/", "layout");
    return { ok: true, message: `Added “${item.name}” as a yearly bill.` };
  } catch (error) {
    return failure(error);
  }
}

export async function dismissYearlyAction(key: string): Promise<InsightState> {
  try {
    await requireUser();
    await dismissYearly(String(key));
    revalidatePath("/", "layout");
    return { ok: true, message: "Won't list that one again." };
  } catch (error) {
    return failure(error);
  }
}
