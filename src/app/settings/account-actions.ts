"use server";

import { revalidatePath } from "next/cache";
import {
  changePassword,
  createInvite,
  endSession,
  removeOtherUser,
  requireUser,
  signOutEverywhere,
  startSession,
} from "@/server/auth";
import { limits, tooMany } from "@/server/limits";
import { toAuthState, type AuthFormState } from "@/server/action-result";

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function changePasswordAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    const user = await requireUser();
    const key = `user:${user.id}`;
    if (!limits.passwordByUser.hit(key)) return { ok: false, message: tooMany(limits.passwordByUser.retryAfter(key)) };

    const updated = await changePassword(user, {
      current: field(form, "current"),
      password: field(form, "password"),
      confirm: field(form, "confirm"),
    });
    // Every other browser and device is now signed out; this one stays in.
    await startSession(updated);
    limits.passwordByUser.reset(key);
    return { ok: true, message: "Password changed. Every other session has been signed out." };
  } catch (error) {
    return toAuthState(error);
  }
}

export async function signOutEverywhereAction(): Promise<AuthFormState> {
  try {
    const user = await requireUser();
    await signOutEverywhere(user);
    await endSession();
    return { ok: true, redirect: "/sign-in" };
  } catch (error) {
    return toAuthState(error);
  }
}

export async function createInviteAction(): Promise<AuthFormState> {
  try {
    const user = await requireUser();
    const key = `user:${user.id}`;
    if (!limits.inviteByUser.hit(key)) return { ok: false, message: tooMany(limits.inviteByUser.retryAfter(key)) };
    const { code, expiresAt } = await createInvite(user.id);
    return { ok: true, code, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    return toAuthState(error);
  }
}

export async function removeUserAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    const user = await requireUser();
    await removeOtherUser(user, field(form, "userId"));
    revalidatePath("/settings/account");
    return { ok: true, message: "Account removed." };
  } catch (error) {
    return toAuthState(error);
  }
}
