/**
 * Accounts and sessions.
 *
 * Plain module (no "use server"): every export of an action file is callable
 * from outside, so the helpers live here and the action files export only
 * guarded actions.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import { encodeSession, type SessionClaims } from "@/lib/auth/session-token";
import { sessionSecret, userCount, userFromToken, type SessionUser } from "./session";

export type { SessionUser } from "./session";
import {
  INVITE_MINUTES,
  MAX_USERS,
  SESSION_COOKIE,
  SESSION_DAYS,
  normalizeUsername,
  passwordProblem,
  usernameProblem,
} from "@/lib/auth/rules";
import { ConflictError, ValidationError } from "./errors";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in required");
    this.name = "UnauthorizedError";
  }
}

// ------------------------------------------------------------------ users

export async function listUsers(): Promise<Array<{ id: string; username: string; createdAt: Date; lastSignInAt: Date | null }>> {
  return prisma.user.findMany({
    select: { id: true, username: true, createdAt: true, lastSignInAt: true },
    orderBy: { createdAt: "asc" },
  });
}

function checkNewAccount(usernameRaw: unknown, password: unknown, confirm: unknown) {
  const username = normalizeUsername(usernameRaw);
  const issues: Record<string, string[]> = {};
  const u = usernameProblem(username);
  if (u) issues.username = [u];
  const p = passwordProblem(password);
  if (p) issues.password = [p];
  else if (password !== confirm) issues.confirm = ["Does not match"];
  if (Object.keys(issues).length) throw new ValidationError(issues);
  return { username, password: password as string };
}

async function createUser(username: string, password: string, inviteId?: string): Promise<SessionUser> {
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const count = await tx.user.count();
    if (inviteId === undefined && count > 0) throw new ConflictError("An account already exists");
    if (count >= MAX_USERS) throw new ConflictError("Budget already has two accounts");
    if (await tx.user.findUnique({ where: { username } })) {
      throw new ValidationError({ username: ["Already taken"] });
    }
    if (inviteId) await tx.inviteCode.delete({ where: { id: inviteId } });
    return tx.user.create({
      data: { username, passwordHash, lastSignInAt: new Date() },
      select: { id: true, username: true, credentialVersion: true },
    });
  });
}

// ------------------------------------------------------------------ setup code

/**
 * First run: the account form asks for a code that is only written to the
 * container log. Reaching the page is not enough — you have to be able to read
 * the server's log, which proves you run the server. Held in memory: a restart
 * mints a new one. Gone once an account exists.
 */
let setupCode: string | null = null;

export async function setupCodeForLog(): Promise<void> {
  // Never mint one once an account exists (a re-render after the account is
  // created would otherwise log a fresh, useless code).
  if (!setupCode && (await userCount()) === 0) {
    setupCode = Array.from({ length: 3 }, () => String(randomInt(0, 10_000)).padStart(4, "0")).join("-");
    console.log("");
    console.log("==> Budget first-run setup code:", setupCode);
    console.log("    Enter it on the Create account page. It works once, and only until an account exists.");
    console.log("");
  }
}

function sameCode(given: unknown, expected: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createFirstUser(input: {
  code: unknown;
  username: unknown;
  password: unknown;
  confirm: unknown;
}): Promise<SessionUser> {
  if (!setupCode || !sameCode(input.code, setupCode)) {
    throw new ValidationError({ code: ["That is not the code in the container log"] });
  }
  const { username, password } = checkNewAccount(input.username, input.password, input.confirm);
  const user = await createUser(username, password);
  setupCode = null;
  return user;
}

// ------------------------------------------------------------------ invites

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** A one-time code for the second person. Shown once; only its hash is kept. */
export async function createInvite(createdById: string): Promise<{ code: string; expiresAt: Date }> {
  if ((await userCount()) >= MAX_USERS) throw new ConflictError("Budget already has two accounts");
  const code = randomBytes(9).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_MINUTES * 60_000);
  await prisma.$transaction([
    // One live code at a time.
    prisma.inviteCode.deleteMany({}),
    prisma.inviteCode.create({ data: { codeHash: hashCode(code), createdById, expiresAt } }),
  ]);
  return { code, expiresAt };
}

export async function joinWithInvite(input: {
  code: unknown;
  username: unknown;
  password: unknown;
  confirm: unknown;
}): Promise<SessionUser> {
  const code = typeof input.code === "string" ? input.code.trim() : "";
  const invite = code
    ? ((await prisma.inviteCode.findUnique({ where: { codeHash: hashCode(code) } })) as {
        id: string;
        expiresAt: Date;
      } | null)
    : null;
  if (!invite || invite.expiresAt.getTime() < Date.now()) {
    throw new ValidationError({ code: ["That code is wrong or has expired. Ask for a new one."] });
  }
  const { username, password } = checkNewAccount(input.username, input.password, input.confirm);
  return createUser(username, password, invite.id);
}

// ------------------------------------------------------------------ sign-in

/** The user if the credentials match, otherwise null — never which part was wrong. */
export async function checkCredentials(usernameRaw: unknown, password: unknown): Promise<SessionUser | null> {
  const username = normalizeUsername(usernameRaw);
  if (typeof password !== "string" || password.length === 0 || password.length > 1_000) return null;

  const user = (await prisma.user.findUnique({ where: { username } })) as {
    id: string;
    username: string;
    passwordHash: string;
    credentialVersion: number;
  } | null;

  if (!user) {
    await burnPasswordCheck(password);
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  await prisma.user.update({ where: { id: user.id }, data: { lastSignInAt: new Date() } });
  return { id: user.id, username: user.username, credentialVersion: user.credentialVersion };
}

async function isHttps(): Promise<boolean> {
  const h = await headers();
  return (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
}

/** Sets the session cookie for this browser. */
export async function startSession(user: SessionUser): Promise<void> {
  const claims: SessionClaims = {
    userId: user.id,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400,
    credentialVersion: user.credentialVersion,
  };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession(claims, await sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** First line of every server action. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

// ------------------------------------------------------------------ account

export async function changePassword(
  user: SessionUser,
  input: { current: unknown; password: unknown; confirm: unknown },
): Promise<SessionUser> {
  const row = (await prisma.user.findUnique({ where: { id: user.id } })) as { passwordHash: string } | null;
  if (!row || typeof input.current !== "string" || !(await verifyPassword(input.current, row.passwordHash))) {
    throw new ValidationError({ current: ["That is not your current password"] });
  }
  const p = passwordProblem(input.password);
  if (p) throw new ValidationError({ password: [p] });
  if (input.password !== input.confirm) throw new ValidationError({ confirm: ["Does not match"] });

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.password as string),
        credentialVersion: { increment: 1 },
      },
      select: { id: true, username: true, credentialVersion: true },
    }),
    // Phones sign in again too; the version check would refuse them anyway.
    prisma.device.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return updated;
}

/** Ends every session of this user, this browser and their phones included. */
export async function signOutEverywhere(user: SessionUser): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { credentialVersion: { increment: 1 } } }),
    prisma.device.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/** Removes the other account. You cannot remove yourself. */
export async function removeOtherUser(user: SessionUser, otherId: unknown): Promise<void> {
  if (typeof otherId !== "string" || otherId === user.id) {
    throw new ValidationError({ user: ["You cannot remove your own account"] });
  }
  await prisma.user.delete({ where: { id: otherId } });
}
