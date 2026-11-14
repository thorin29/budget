"use server";

import { createFirstUser, startSession } from "@/server/auth";
import { callerIp, limits, tooMany } from "@/server/limits";
import { toAuthState, type AuthFormState } from "@/server/action-result";

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** Open only while no account exists; createFirstUser refuses otherwise. */
export async function createFirstAccountAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    const key = `ip:${await callerIp()}`;
    if (!limits.setupByIp.hit(key)) return { ok: false, message: tooMany(limits.setupByIp.retryAfter(key)) };

    const user = await createFirstUser({
      code: field(form, "code"),
      username: field(form, "username"),
      password: field(form, "password"),
      confirm: field(form, "confirm"),
    });
    await startSession(user);
    return { ok: true, redirect: "/month" };
  } catch (error) {
    return toAuthState(error);
  }
}
