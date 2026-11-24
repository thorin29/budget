"use server";

/** Transaction category actions. Each checks its caller first. */

import { revalidatePath } from "next/cache";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { NotFoundError, ValidationError } from "@/server/errors";
import { resetTransactionCategory, setTransactionCategory } from "@/server/categorize";
import { setTransfer } from "@/server/transfer-mark";
import { setSplitCategory } from "@/server/amazon-items";

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
    revalidatePath("/review");
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
    revalidatePath("/review");
    return { ok: true, others: 0 };
  } catch (error) {
    return failure(error);
  }
}

export async function setTransferAction(txnId: string, on: boolean, forMerchant = false): Promise<CategoryResult> {
  try {
    await requireUser();
    const others = await setTransfer(String(txnId), Boolean(on), Boolean(forMerchant));
    revalidatePath("/transactions");
    revalidatePath("/insights");
    revalidatePath("/review");
    return { ok: true, others };
  } catch (error) {
    return failure(error);
  }
}

/** One item of a split charge: its category, remembered for that item everywhere. */
export async function setSplitCategoryAction(splitId: string, categoryId: string | null): Promise<CategoryResult> {
  try {
    await requireUser();
    const others = await setSplitCategory(String(splitId), categoryId ? String(categoryId) : null);
    revalidatePath("/transactions");
    revalidatePath("/insights");
    revalidatePath("/review");
    return { ok: true, others };
  } catch (error) {
    return failure(error);
  }
}

/** A new category from the item picker, in the budget picked, then used for that item. */
export async function newCategoryForSplitAction(splitId: string, name: string, groupId: string | null): Promise<CategoryResult & { categoryId?: string; name?: string }> {
  try {
    await requireUser();
    const { createCategory } = await import("@/server/categories");
    const { prisma } = await import("@/lib/prisma");
    const made = await createCategory({ name: String(name) });
    if (groupId) {
      const group = await prisma.categoryGroup.findUnique({ where: { id: String(groupId) }, select: { id: true } });
      if (group) await prisma.category.update({ where: { id: made.id }, data: { groupId: group.id } });
    }
    const others = await setSplitCategory(String(splitId), made.id);
    revalidatePath("/transactions");
    revalidatePath("/insights");
    revalidatePath("/settings/budgets");
    return { ok: true, others, categoryId: made.id, name: made.name };
  } catch (error) {
    return failure(error);
  }
}
