"use server";

/** Settings → Bank sync. Every export is an action and checks the caller first. */

import { revalidatePath } from "next/cache";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { BankFeedError } from "@/lib/simplefin";
import { MissingKeyError } from "@/lib/secret-box";
import { createLimiter } from "@/lib/auth/rate-limit";
import { connectBank, deleteAllBankData, disconnectBank, syncBank } from "@/server/bank/sync";
import { setBankAccountHidden, setBankAccountType, setBillsSource } from "@/server/bank/accounts";
import { importCombinedCsv, importCsv, previewCombinedCsv, previewCsv, revertCsvImport, type CombinedPart, type CsvPreview } from "@/server/bank/csv-import";

export type BankActionState = { ok: true; message?: string } | { ok: false; message: string };
export type BankResult<T> = { ok: true; data: T } | { ok: false; message: string };

// Bridges allow a couple of dozen requests a day; manual syncs get a share of that.
const manualSyncs = createLimiter({ limit: 6, windowMs: 24 * 60 * 60_000 });
const connects = createLimiter({ limit: 5, windowMs: 60 * 60_000 });

function failure(error: unknown): { ok: false; message: string } {
  if (error instanceof BankFeedError || error instanceof MissingKeyError) return { ok: false, message: error.message };
  if (error instanceof ValidationError) {
    const issues = Object.values(error.issues).flat();
    return { ok: false, message: issues.length ? issues.join(". ") : error.message };
  }
  if (error instanceof ConflictError || error instanceof NotFoundError) return { ok: false, message: error.message };
  if (error instanceof UnauthorizedError) return { ok: false, message: "Your session ended. Sign in again." };
  console.error("Bank action failed:", error);
  return { ok: false, message: "Something went wrong" };
}

const done = () => revalidatePath("/settings/bank");

export async function connectBankAction(_prev: BankActionState, form: FormData): Promise<BankActionState> {
  try {
    const user = await requireUser();
    if (!connects.hit(user.id)) return { ok: false, message: "Too many tries. Wait a bit and use a fresh setup token." };
    const token = form.get("token");
    if (typeof token !== "string" || !token.trim()) return { ok: false, message: "Paste the setup token" };
    const result = await connectBank(token);
    done();
    return result
      ? { ok: true, message: `Connected. ${result.accounts} accounts and ${result.added} transactions came in.` }
      : { ok: true, message: "Connected, but the first sync had a problem. See the status below." };
  } catch (error) {
    return failure(error);
  }
}

export async function syncBankAction(): Promise<BankActionState> {
  try {
    await requireUser();
    if (!manualSyncs.hit("bank")) {
      return { ok: false, message: "Manual syncs are limited to 6 a day, to stay inside the bridge's limits. The daily sync still runs." };
    }
    const result = await syncBank();
    done();
    return { ok: true, message: `Synced ${result.accounts} accounts: ${result.added} new, ${result.updated} updated, ${result.transfers} transfers matched.` };
  } catch (error) {
    done();
    return failure(error);
  }
}

export async function disconnectBankAction(): Promise<BankActionState> {
  try {
    await requireUser();
    await disconnectBank();
    done();
    return { ok: true, message: "Disconnected. Accounts and transactions are kept until you delete them." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteBankDataAction(): Promise<BankActionState> {
  try {
    await requireUser();
    await deleteAllBankData();
    done();
    return { ok: true, message: "All bank data deleted." };
  } catch (error) {
    return failure(error);
  }
}

export async function setAccountTypeAction(id: string, type: string): Promise<BankActionState> {
  try {
    await requireUser();
    await setBankAccountType(String(id), String(type));
    revalidatePath("/accounts");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setAccountHiddenAction(id: string, hidden: boolean): Promise<BankActionState> {
  try {
    await requireUser();
    await setBankAccountHidden(String(id), Boolean(hidden));
    revalidatePath("/accounts");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setBillsSourceAction(bankAccountId: string): Promise<BankActionState> {
  try {
    await requireUser();
    await setBillsSource(bankAccountId ? String(bankAccountId) : null);
    revalidatePath("/", "layout");
    return { ok: true, message: bankAccountId ? "The bills balance now comes from the bank every morning." : "You'll type the bills balance by hand." };
  } catch (error) {
    return failure(error);
  }
}

export async function previewCsvAction(accountId: string, text: string, flipSigns: boolean): Promise<BankResult<CsvPreview>> {
  try {
    await requireUser();
    return { ok: true, data: await previewCsv(String(accountId), String(text), Boolean(flipSigns)) };
  } catch (error) {
    return failure(error);
  }
}

export async function importCsvAction(
  accountId: string,
  text: string,
  flipSigns: boolean,
  fileName: string,
): Promise<BankResult<{ added: number; skipped: number }>> {
  try {
    await requireUser();
    const result = await importCsv(String(accountId), String(text), Boolean(flipSigns), String(fileName ?? ""));
    done();
    return { ok: true, data: { added: result.added, skipped: result.skipped } };
  } catch (error) {
    return failure(error);
  }
}

export async function revertCsvAction(importId: string): Promise<BankActionState> {
  try {
    await requireUser();
    const { removed } = await revertCsvImport(String(importId));
    done();
    return { ok: true, message: `Removed ${removed} transactions.` };
  } catch (error) {
    return failure(error);
  }
}

/** Connects a bills account to a bank feed account, or disconnects it. */
export async function connectAccountAction(accountId: string, bankAccountId: string): Promise<BankActionState> {
  try {
    await requireUser();
    const { connectAccount } = await import("@/server/bank/ledger");
    await connectAccount(String(accountId), bankAccountId ? String(bankAccountId) : null);
    revalidatePath("/", "layout");
    return { ok: true, message: bankAccountId ? "Connected. Its balance now comes from the bank." : "Disconnected." };
  } catch (error) {
    return failure(error);
  }
}

export async function previewCombinedAction(text: string): Promise<BankResult<CombinedPart[]>> {
  try {
    await requireUser();
    return { ok: true, data: await previewCombinedCsv(String(text)) };
  } catch (error) {
    return failure(error);
  }
}

export async function importCombinedAction(text: string, fileName: string): Promise<BankResult<{ added: number; skipped: number; accounts: number; unmatched: string[]; categorized: number }>> {
  try {
    await requireUser();
    const result = await importCombinedCsv(String(text), String(fileName ?? ""));
    done();
    return { ok: true, data: result };
  } catch (error) {
    return failure(error);
  }
}

/** A card's statement closing day, payment due day and 0% end date. */
export async function setCardTermsAction(id: string, closeDay: string, dueDay: string, promoEndsOn: string, color?: string, nickname?: string): Promise<BankActionState> {
  try {
    await requireUser();
    const { setCardTerms } = await import("@/server/card-payments");
    const num = (v: string) => (String(v ?? "").trim() ? Number(v) : null);
    await setCardTerms(String(id), {
      closeDay: num(closeDay),
      dueDay: num(dueDay),
      promoEndsOn: String(promoEndsOn ?? "").trim() || null,
      ...(color === undefined ? {} : { color: String(color) || null }),
      ...(nickname === undefined ? {} : { nickname: String(nickname) }),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}
