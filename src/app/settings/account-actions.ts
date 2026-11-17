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
import { createEnrollCode, revokeDevice } from "@/server/device-auth";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { toAuthState, type AuthFormState } from "@/server/action-result";

/** The address this site was reached at, as the phone should use it. */
async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto === "https" ? "https" : "http"}://${host}` : "";
}

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
    // The phone app scans this to create the account: the server address and the code, nothing else.
    const server = await publicOrigin();
    const link = `budget://join?server=${encodeURIComponent(server)}&code=${encodeURIComponent(code)}`;
    const qr = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { ok: true, code, expiresAt: expiresAt.toISOString(), link, qr: `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}` };
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

// ------------------------------------------------------------------ phones

export type EnrollCodeState =
  | { ok: true; code: string; expiresAt: string; qr: string; link: string }
  | { ok: false; message: string };

/** A one-time code (and QR) for adding a phone to the signed-in person. */
export async function createEnrollCodeAction(): Promise<EnrollCodeState> {
  try {
    const user = await requireUser();
    const key = `user:${user.id}`;
    if (!limits.enrollCodeByUser.hit(key)) {
      return { ok: false, message: tooMany(limits.enrollCodeByUser.retryAfter(key)) };
    }
    const { code, expiresAt } = await createEnrollCode(user.id);
    const server = await publicOrigin();
    // The phone app can scan this; it carries the server address and the code,
    // nothing else. The address never has to be built into the app.
    const link = `budget://enroll?server=${encodeURIComponent(server)}&code=${encodeURIComponent(code)}`;
    const qr = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return {
      ok: true,
      code,
      expiresAt: expiresAt.toISOString(),
      qr: `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}`,
      link,
    };
  } catch (error) {
    const state = toAuthState(error);
    return { ok: false, message: (!state.ok && state.message) || "Something went wrong" };
  }
}

export async function revokeDeviceAction(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    const user = await requireUser();
    await revokeDevice(user.id, field(form, "deviceId"));
    revalidatePath("/settings/security");
    return { ok: true, message: "Signed out." };
  } catch (error) {
    return toAuthState(error);
  }
}
