"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { applyChanges, previewChanges, type ChangeStep } from "@/server/changes-file";
import { ValidationError } from "@/server/errors";

type Fail = { ok: false; message: string };
const fail = (error: unknown): Fail => ({
  ok: false,
  message: error instanceof ValidationError ? Object.values(error.issues).flat()[0] ?? "Check the file" : error instanceof Error ? error.message : "Something went wrong",
});

export async function previewChangesAction(text: string): Promise<{ ok: true; note: string | null; steps: ChangeStep[] } | Fail> {
  await requireUser();
  try {
    return { ok: true, ...(await previewChanges(text)) };
  } catch (error) {
    return fail(error);
  }
}

export async function applyChangesAction(text: string, choices: Record<string, string>): Promise<{ ok: true; applied: number; skipped: Array<{ n: number; problem: string }> } | Fail> {
  await requireUser();
  try {
    const result = await applyChanges(text, choices);
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (error) {
    return fail(error);
  }
}
