/** The shape every account action returns to its form. */

import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { UnauthorizedError } from "./auth";

export type AuthFormState =
  | { ok: true; redirect?: string; message?: string; code?: string; expiresAt?: string }
  | { ok: false; message?: string; issues?: Record<string, string[]> };

export function toAuthState(error: unknown): AuthFormState {
  if (error instanceof ValidationError) return { ok: false, message: error.message, issues: error.issues };
  if (error instanceof ConflictError || error instanceof NotFoundError) return { ok: false, message: error.message };
  if (error instanceof UnauthorizedError) return { ok: false, message: "Your session ended. Sign in again." };
  console.error("Account action failed:", error);
  return { ok: false, message: "Something went wrong" };
}
