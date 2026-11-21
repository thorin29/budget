"use server";

/** Transaction category actions. Each checks its caller first. */

import { revalidatePath } from "next/cache";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { NotFoundError, ValidationError } from "@/server/errors";
import { resetTransactionCategory, setTransactionCategory } from "@/server/categorize";
import { setTransfer } from "@/server/transfer-mark";

export type CategoryResult = { ok: true; others: number } | { ok: false; message: string };

function failure(error: unknown): CategoryResult {
  if (error instanceof ValidationError) return { ok: false, message: Object.values(error.issues).flat()[0] ?? error.message };
  if (error instanceof NotFoundError || error instanceof UnauthorizedError) return { ok: false, message: error.message };
  console.error("Category action failed:", error);
  return { ok: false, message: "Something went wrong" };
}

export async function setCategoryAction(txnId: string, categoryId: string | null, forMerchant: boolean): Promise<CategoryResult> {
  try {
    await requireUser();
    const others = await setTransactionCategory(String(txnId), categoryId ? String(categoryId) : null, Boolean(forMerchant));
    revalidatePath("/transactions");
    revalidatePath("/insights");
    return { ok: true, others };
  } catch (error) {
    return failure(error);
  }
}

export async function resetCategoryAction(txnId: string): Promise<CategoryResult> {
  try {
    await requireUser();
    await resetTransactionCategory(String(txnId));
    revalidatePath("/transactions");
    revalidatePath("/insights");
    return { ok: true, others: 0 };
  } catch (error) {
    return failure(error);
  }
}

export async function setTransferAction(txnId: string, on: boolean): Promise<CategoryResult> {
  try {
    await requireUser();
    await setTransfer(String(txnId), Boolean(on));
    revalidatePath("/transactions");
    revalidatePath("/insights");
    return { ok: true, others: 0 };
  } catch (error) {
    return failure(error);
  }
}
