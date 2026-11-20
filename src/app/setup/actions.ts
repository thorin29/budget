"use server";

import { requireUser } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { createAccount, deleteAccount, updateAccount } from "@/server/accounts";
import { createCategory, deleteCategory, setManagedForOthers } from "@/server/categories";
import { createPaySchedule, deletePaySchedule } from "@/server/pay-schedule";
import { updateSettings } from "@/server/settings";
import { ValidationError } from "@/server/errors";
import { parseCents } from "@/lib/money";

export interface FormState {
  ok: boolean;
  message?: string;
  issues?: Record<string, string[]>;
}

const EMPTY: FormState = { ok: true };

/** Wraps an action so a validation failure becomes form state, not a crash. */
async function run(_path: string, work: () => Promise<void>): Promise<FormState> {
  try {
    // Every action checks its caller: a path-based gate cannot cover actions.
    await requireUser();
    await work();
    // Settings feed the month view, the projection and the sidebar alike.
    revalidatePath("/", "layout");
    return EMPTY;
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, message: error.message, issues: error.issues };
    }
    if (error instanceof Error) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Something went wrong" };
  }
}

const str = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();

export async function addAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/setup/accounts", async () => {
    const settledBy = str(form, "settledById");
    await createAccount({
      name: str(form, "name"),
      kind: str(form, "kind") as never,
      settledById: settledBy || null,
    });
  });
}

export async function toggleAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/setup/accounts", async () => {
    await updateAccount(str(form, "id"), {
      name: str(form, "name"),
      kind: str(form, "kind") as never,
      settledById: str(form, "settledById") || null,
      active: str(form, "active") === "true",
    });
  });
}

export async function removeAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/setup/accounts", async () => {
    await deleteAccount(str(form, "id"));
  });
}

export async function addCategoryAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/setup/categories", async () => {
    await createCategory({ name: str(form, "name") });
  });
}

export async function removeCategoryAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/setup/categories", async () => {
    await deleteCategory(str(form, "id"));
  });
}

export async function setManagedAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/settings/categories", async () => {
    await setManagedForOthers(str(form, "id"), str(form, "managed") === "1");
  });
}

export async function addPayScheduleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/setup/pay", async () => {
    const days = str(form, "daysOfMonth")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 31);

    await createPaySchedule({
      name: str(form, "name"),
      frequency: str(form, "frequency") as never,
      anchorDate: str(form, "anchorDate") || null,
      daysOfMonth: days,
      activeFrom: str(form, "activeFrom"),
      activeTo: str(form, "activeTo") || null,
    });
  });
}

export async function removePayScheduleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/setup/pay", async () => {
    await deletePaySchedule(str(form, "id"));
  });
}

export async function savePreferencesAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  return run("/setup/preferences", async () => {
    const bufferRaw = str(form, "buffer");
    // "payday:<schedule id>" divides the month at that schedule's payday; "payday" at the main one's.
    const mode = str(form, "splitMode");
    const scheduleId = mode.startsWith("payday:") ? mode.slice(7) : null;
    const { prisma } = await import("@/lib/prisma");
    const { SETTING_KEYS } = await import("@/lib/settings");
    await prisma.setting.upsert({ where: { key: SETTING_KEYS.splitSchedule }, create: { key: SETTING_KEYS.splitSchedule, value: scheduleId as never }, update: { value: scheduleId as never } });
    await updateSettings({
      splitDay: Number(str(form, "splitDay")),
      splitMode: mode === "day" ? "day" : "payday",
      horizonDays: Number(str(form, "horizonDays")),
      bufferCents: bufferRaw ? parseCents(bufferRaw) : 0,
      carryMonths: Number(str(form, "carryMonths")),
      billsAccountId: str(form, "billsAccountId") || null,
    });
  });
}

/** Sets the pay calendar to what the paycheck deposits show. */
export async function usePayFromDepositsAction(): Promise<void> {
  await requireUser();
  const { usePayFromDeposits } = await import("@/server/pay-detect");
  await usePayFromDeposits();
  revalidatePath("/", "layout");
}

/** Pay Settings › Tracker periods: whole month, halves at a payday, or halves at a fixed day. */
export async function savePeriodsAction(mode: string, splitDay: number, scheduleId: string | null): Promise<FormState> {
  return run("/settings/pay", async () => {
    await requireUser();
    const { getSettings } = await import("@/server/settings");
    const { prisma } = await import("@/lib/prisma");
    const { SETTING_KEYS } = await import("@/lib/settings");
    const s = await getSettings();
    const m = mode === "none" || mode === "day" ? mode : "payday";
    await prisma.setting.upsert({ where: { key: SETTING_KEYS.splitSchedule }, create: { key: SETTING_KEYS.splitSchedule, value: (m === "payday" ? scheduleId : null) as never }, update: { value: (m === "payday" ? scheduleId : null) as never } });
    await updateSettings({ splitDay: m === "day" ? Number(splitDay) : s.splitDay, splitMode: m, horizonDays: s.horizonDays, bufferCents: s.bufferCents, carryMonths: s.carryMonths, billsAccountId: s.billsAccountId });
  });
}

/** Bills & Income options: the bills account, how far ahead to look, how long unpaid bills carry. */
export async function saveBillOptionsAction(billsAccountId: string | null, horizonDays: number, carryMonths: number): Promise<FormState> {
  return run("/line-items", async () => {
    await requireUser();
    const { getSettings } = await import("@/server/settings");
    const s = await getSettings();
    await updateSettings({ splitDay: s.splitDay, splitMode: s.splitMode, horizonDays: Number(horizonDays), bufferCents: s.bufferCents, carryMonths: Number(carryMonths), billsAccountId: billsAccountId || null });
  });
}

export async function endPayScheduleAction(id: string, endOn: string): Promise<FormState> {
  return run("/settings/pay", async () => {
    await requireUser();
    const { endPaySchedule } = await import("@/server/pay-schedule");
    await endPaySchedule(String(id), String(endOn));
  });
}

export async function reopenPayScheduleAction(id: string): Promise<FormState> {
  return run("/settings/pay", async () => {
    await requireUser();
    const { reopenPaySchedule } = await import("@/server/pay-schedule");
    await reopenPaySchedule(String(id));
  });
}

export async function linkPaycheckAction(lineItemId: string, scheduleId: string | null): Promise<FormState> {
  return run("/settings/pay", async () => {
    await requireUser();
    const { linkPaycheck } = await import("@/server/pay-schedule");
    await linkPaycheck(String(lineItemId), scheduleId ? String(scheduleId) : null);
  });
}
