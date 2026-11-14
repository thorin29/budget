"use server";

/**
 * The web importer's entry points. The browser never calls /api/v1: that API
 * is for the phone and will take device tokens only. Every export here is an
 * action; helpers live in plain modules.
 */

import { revalidatePath } from "next/cache";
import {
  applyImport,
  buildPlan,
  parseDocument,
  revertImport,
  validateAmounts,
  type ImportChoices,
} from "@/server/import";
import { ValidationError, NotFoundError, ConflictError } from "@/server/errors";

export type ImportActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function failure(error: unknown): { ok: false; message: string } {
  if (error instanceof ValidationError) {
    const issues = Object.values(error.issues).flat();
    return { ok: false, message: issues.length ? issues.join(". ") : error.message };
  }
  if (error instanceof NotFoundError || error instanceof ConflictError) {
    return { ok: false, message: error.message };
  }
  console.error("Import action failed:", error);
  return { ok: false, message: "Something went wrong" };
}

function checked(document: unknown) {
  const parsed = parseDocument(document);
  const problems = validateAmounts(parsed);
  if (problems.length) throw new ValidationError({ amounts: problems });
  return parsed;
}

export async function previewImportAction(
  document: unknown,
  choices?: Partial<ImportChoices>,
): Promise<ImportActionResult<Awaited<ReturnType<typeof buildPlan>>>> {
  try {
    return { ok: true, data: await buildPlan(checked(document), choices) };
  } catch (error) {
    return failure(error);
  }
}

export async function applyImportAction(
  document: unknown,
  choices?: Partial<ImportChoices>,
): Promise<ImportActionResult<Awaited<ReturnType<typeof applyImport>>>> {
  try {
    const result = await applyImport(checked(document), choices);
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

export async function revertImportAction(
  batchId: string,
): Promise<ImportActionResult<{ removed: number }>> {
  try {
    if (typeof batchId !== "string" || !batchId) throw new ValidationError({ batchId: ["Required"] });
    const result = await revertImport(batchId);
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}
