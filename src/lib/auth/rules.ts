/**
 * Every sign-in rule in one place, shared by the web forms, the server
 * actions, the reset script and (later) the phone API. Kairos once had two
 * different password minimums; one constant prevents that.
 */

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

/** Two people at most; both are equal. */
export const MAX_USERS = 2;

export const SESSION_COOKIE = "budget_session";
export const SESSION_DAYS = 30;

export const INVITE_MINUTES = 15;

const USERNAME = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Null when acceptable, otherwise the reason. */
export function usernameProblem(username: string): string | null {
  return USERNAME.test(username)
    ? null
    : "3 to 32 characters: letters, numbers, dot, dash or underscore";
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string") return "Required";
  if (password.length < MIN_PASSWORD) return `At least ${MIN_PASSWORD} characters`;
  if (password.length > MAX_PASSWORD) return `At most ${MAX_PASSWORD} characters`;
  return null;
}
