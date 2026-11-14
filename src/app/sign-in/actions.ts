"use server";

import { checkCredentials, endSession, startSession } from "@/server/auth";
import { callerIp, limits, tooMany } from "@/server/limits";
import { toAuthState, type AuthFormState } from "@/server/action-result";
import { normalizeUsername } from "@/lib/auth/rules";
import { safeNext } from "@/lib/auth/safe-next";

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function signInAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    const ip = await callerIp();
    const username = normalizeUsername(field(form, "username"));
    const ipKey = `ip:${ip}`;
    const userKey = `user:${username}`;

    const ipOk = limits.signInByIp.hit(ipKey);
    const userOk = limits.signInByUser.hit(userKey);
    if (!ipOk || !userOk) {
      return {
        ok: false,
        message: tooMany(Math.max(limits.signInByIp.retryAfter(ipKey), limits.signInByUser.retryAfter(userKey))),
      };
    }

    const user = await checkCredentials(username, field(form, "password"));
    if (!user) return { ok: false, message: "Wrong username or password" };

    limits.signInByUser.reset(userKey);
    await startSession(user);
    // The client navigates with a full page load, so the layout and the gate run again.
    return { ok: true, redirect: safeNext(field(form, "next")) };
  } catch (error) {
    return toAuthState(error);
  }
}

/** Signing out needs no check: it only ever removes this browser's cookie. */
export async function signOutAction(): Promise<AuthFormState> {
  await endSession();
  return { ok: true, redirect: "/sign-in" };
}
