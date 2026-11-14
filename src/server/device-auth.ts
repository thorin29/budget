/**
 * Phone authentication for /api/v1. Bearer tokens only: the API never reads
 * the browser's session cookie, so the one path Authelia lets through is
 * guarded entirely by these checks.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  DEVICE_TOKEN_DAYS,
  ENROLL_MINUTES,
  LAST_SEEN_MINUTES,
  LOGIN_PROOF_MINUTES,
  MAX_DEVICES_PER_USER,
} from "@/lib/auth/rules";
import {
  bearerFrom,
  cleanDeviceName,
  decodeLoginProof,
  encodeLoginProof,
  hashToken,
  newDeviceToken,
  newEnrollCode,
  normalizeEnrollCode,
} from "@/lib/auth/device-token";
import { sessionSecret } from "./session";
import { ConflictError, ValidationError } from "./errors";

/**
 * Why a request was refused, as a stable code the phone acts on:
 *  missing_bearer   — no token sent: sign in
 *  invalid_token    — unknown token: enrol again
 *  device_revoked   — revoked from Settings: enrol again
 *  device_expired   — over a year without refresh: enrol again
 *  reauth_required  — password changed or signed out everywhere: enrol again
 */
export type DeviceAuthCode =
  | "missing_bearer"
  | "invalid_token"
  | "device_revoked"
  | "device_expired"
  | "reauth_required";

export class DeviceAuthError extends Error {
  readonly code: DeviceAuthCode;
  constructor(code: DeviceAuthCode, message: string) {
    super(message);
    this.name = "DeviceAuthError";
    this.code = code;
  }
}

export interface DeviceAuth {
  user: { id: string; username: string };
  device: { id: string; name: string; expiresAt: Date };
}

interface DeviceRow {
  id: string;
  name: string;
  credentialVersion: number;
  expiresAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  user: { id: string; username: string; credentialVersion: number };
}

/** First line of every guarded /api/v1 handler. */
export async function requireDevice(request: Request, now = new Date()): Promise<DeviceAuth> {
  const token = bearerFrom(request.headers.get("authorization"));
  if (!token) throw new DeviceAuthError("missing_bearer", "Send the device token as a Bearer header");

  const device = (await prisma.device.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, username: true, credentialVersion: true } } },
  })) as DeviceRow | null;

  if (!device) throw new DeviceAuthError("invalid_token", "Unknown device token");
  if (device.revokedAt) throw new DeviceAuthError("device_revoked", "This device was signed out");
  if (device.expiresAt.getTime() <= now.getTime()) throw new DeviceAuthError("device_expired", "This device's sign-in expired");
  if (device.credentialVersion !== device.user.credentialVersion) {
    throw new DeviceAuthError("reauth_required", "The password changed; sign this device in again");
  }

  if (!device.lastSeenAt || now.getTime() - device.lastSeenAt.getTime() > LAST_SEEN_MINUTES * 60_000) {
    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: now } });
  }

  return {
    user: { id: device.user.id, username: device.user.username },
    device: { id: device.id, name: device.name, expiresAt: device.expiresAt },
  };
}

// ------------------------------------------------------------------ enrolment

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Shown on the web for the signed-in user. Replaces any earlier live code. */
export async function createEnrollCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = newEnrollCode();
  const expiresAt = new Date(Date.now() + ENROLL_MINUTES * 60_000);
  await prisma.enrollCode.upsert({
    where: { userId },
    create: { userId, codeHash: sha(code), expiresAt },
    update: { codeHash: sha(code), expiresAt },
  });
  return { code, expiresAt };
}

/** Step 1 on the phone: a correct password earns a five-minute proof. */
export async function issueLoginProof(user: { id: string; credentialVersion: number }): Promise<{
  proof: string;
  expiresAt: Date;
}> {
  const expiresAt = Math.floor(Date.now() / 1000) + LOGIN_PROOF_MINUTES * 60;
  return {
    proof: encodeLoginProof({ userId: user.id, expiresAt, credentialVersion: user.credentialVersion }, await sessionSecret()),
    expiresAt: new Date(expiresAt * 1000),
  };
}

/**
 * Step 2: proof + the code from the web, for the same person, yields a token.
 * The token is returned once and never stored.
 */
export async function enrollDevice(input: {
  proof: unknown;
  code: unknown;
  name: unknown;
}): Promise<{ token: string; expiresAt: Date; device: { id: string; name: string }; userId: string }> {
  const proof = decodeLoginProof(input.proof, await sessionSecret());
  if (!proof) throw new ValidationError({ proof: ["Sign in again; that step expired"] });

  const code = normalizeEnrollCode(input.code);
  const user = (await prisma.user.findUnique({
    where: { id: proof.userId },
    select: { id: true, credentialVersion: true },
  })) as { id: string; credentialVersion: number } | null;
  if (!user || user.credentialVersion !== proof.credentialVersion) {
    throw new ValidationError({ proof: ["Sign in again; that step expired"] });
  }

  const enrol = code
    ? ((await prisma.enrollCode.findUnique({ where: { codeHash: sha(code) } })) as {
        id: string;
        userId: string;
        expiresAt: Date;
      } | null)
    : null;
  // The code must be this person's, unexpired. The message never says which part failed.
  if (!enrol || enrol.userId !== user.id || enrol.expiresAt.getTime() < Date.now()) {
    throw new ValidationError({ code: ["That code is wrong or has expired. Make a new one in Settings."] });
  }

  const active = await prisma.device.count({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (active >= MAX_DEVICES_PER_USER) {
    throw new ConflictError(`You already have ${MAX_DEVICES_PER_USER} devices. Revoke one in Settings first.`);
  }

  const token = newDeviceToken();
  const expiresAt = new Date(Date.now() + DEVICE_TOKEN_DAYS * 86_400_000);
  const device = await prisma.$transaction(async (tx) => {
    await tx.enrollCode.delete({ where: { id: enrol.id } });
    return tx.device.create({
      data: {
        userId: user.id,
        name: cleanDeviceName(input.name),
        tokenHash: hashToken(token),
        credentialVersion: user.credentialVersion,
        expiresAt,
        lastSeenAt: new Date(),
      },
      select: { id: true, name: true },
    });
  });

  return { token, expiresAt, device, userId: user.id };
}

/** A fresh token for a device in good standing; the old one stops working. */
export async function refreshDevice(auth: DeviceAuth): Promise<{ token: string; expiresAt: Date }> {
  const token = newDeviceToken();
  const expiresAt = new Date(Date.now() + DEVICE_TOKEN_DAYS * 86_400_000);
  await prisma.device.update({
    where: { id: auth.device.id },
    data: { tokenHash: hashToken(token), expiresAt, lastSeenAt: new Date() },
  });
  return { token, expiresAt };
}

export async function revokeDevice(userId: string, deviceId: unknown): Promise<void> {
  if (typeof deviceId !== "string") throw new ValidationError({ device: ["Required"] });
  // Scoped to the owner: one person can't sign out the other's phone by id.
  await prisma.device.updateMany({
    where: { id: deviceId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function listDevices(userId: string): Promise<
  Array<{ id: string; name: string; createdAt: Date; lastSeenAt: Date | null; expiresAt: Date }>
> {
  return prisma.device.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, name: true, createdAt: true, lastSeenAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
}
