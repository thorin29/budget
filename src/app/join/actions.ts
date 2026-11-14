"use server";

import { joinWithInvite, startSession } from "@/server/auth";
import { callerIp, limits, tooMany } from "@/server/limits";
import { toAuthState, type AuthFormState } from "@/server/action-result";

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** The invite code is the authority: one use, 15 minutes, hash stored. */
export async function joinAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    const key = `ip:${await callerIp()}`;
    if (!limits.joinByIp.hit(key)) return { ok: false, message: tooMany(limits.joinByIp.retryAfter(key)) };

    const user = await joinWithInvite({
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
