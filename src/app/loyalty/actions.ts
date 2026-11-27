"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { addCard, deleteCard, setImage, updateCard } from "@/server/loyalty";
import { ValidationError } from "@/server/errors";

export type LoyaltyResult = { ok: true; id?: string } | { ok: false; message: string };

function failure(error: unknown): LoyaltyResult {
  if (error instanceof ValidationError) return { ok: false, message: Object.values(error.issues).flat()[0] ?? "Check the card" };
  return { ok: false, message: error instanceof Error ? error.message : "Something went wrong" };
}

export async function saveCardAction(id: string | null, input: Record<string, string>): Promise<LoyaltyResult> {
  try {
    await requireUser();
    const card = id ? await updateCard(id, input) : await addCard(input);
    revalidatePath("/loyalty");
    return { ok: true, id: card.id };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCardAction(id: string): Promise<LoyaltyResult> {
  try {
    await requireUser();
    await deleteCard(id);
    revalidatePath("/loyalty");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Sets (or, with no file, removes) a card's image. */
export async function setImageAction(id: string, form: FormData): Promise<LoyaltyResult> {
  try {
    await requireUser();
    const file = form.get("image");
    await setImage(id, file instanceof File && file.size ? new Uint8Array(await file.arrayBuffer()) : null);
    revalidatePath("/loyalty");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
