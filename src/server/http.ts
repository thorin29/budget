/**
 * Response shape for /api/v1.
 *
 * Fixed from the start because a future client — a phone app, a script — should
 * not have to special-case endpoints. Create and update return the full record,
 * including its id and timestamps; errors share one envelope.
 */

import { NextResponse } from "next/server";
import { ChangedElsewhereError, ConflictError, NotFoundError, PayloadTooLargeError, ValidationError } from "./errors";
import { DeviceAuthError, type DeviceAuthCode } from "./device-auth";

export interface ApiError {
  error: {
    code:
      | "validation_failed"
      | "not_found"
      | "conflict"
      | "bad_request"
      | "too_large"
      | "rate_limited"
      | "changed_elsewhere"
      | "internal"
      | DeviceAuthCode;
    message: string;
    issues?: Record<string, string[]>;
  };
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

/** Translates a domain error into a response. Anything unexpected is a 500. */
export function fail(error: unknown): NextResponse {
  if (error instanceof DeviceAuthError && error.code === "wrong_scope") {
    // Signed in fine, just not allowed here: 403, so the client doesn't sign in again.
    return NextResponse.json<ApiError>({ error: { code: error.code, message: error.message } }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof DeviceAuthError) {
    return NextResponse.json<ApiError>(
      { error: { code: error.code, message: error.message } },
      { status: 401, headers: { "WWW-Authenticate": `Bearer error="${error.code}"`, "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof ChangedElsewhereError) {
    return NextResponse.json<ApiError>(
      { error: { code: "changed_elsewhere", message: error.message } },
      { status: 409 },
    );
  }
  if (error instanceof RateLimitedError) {
    return NextResponse.json<ApiError>(
      { error: { code: "rate_limited", message: error.message } },
      { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
    );
  }
  if (error instanceof ValidationError) {
    return NextResponse.json<ApiError>(
      { error: { code: "validation_failed", message: error.message, issues: error.issues } },
      { status: 422 },
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json<ApiError>(
      { error: { code: "not_found", message: error.message } },
      { status: 404 },
    );
  }
  if (error instanceof ConflictError) {
    return NextResponse.json<ApiError>(
      { error: { code: "conflict", message: error.message } },
      { status: 409 },
    );
  }

  if (error instanceof PayloadTooLargeError) {
    return NextResponse.json<ApiError>(
      { error: { code: "too_large", message: error.message } },
      { status: 413 },
    );
  }

  console.error("Unhandled error in API route:", error);
  return NextResponse.json<ApiError>(
    { error: { code: "internal", message: "Something went wrong" } },
    { status: 500 },
  );
}

/** Default cap for a JSON body. Every route but import stays far under it. */
export const DEFAULT_BODY_LIMIT = 256 * 1024;

/** The import document is the one large body. */
export const IMPORT_BODY_LIMIT = 5 * 1024 * 1024;

/**
 * Reads a JSON body, refusing one over `maxBytes` (413) and turning a
 * malformed one into a 400 rather than a crash. The declared length is checked
 * first, then the bytes actually read, so a missing or false header does not
 * get around the cap.
 */
export async function readJson(request: Request, maxBytes = DEFAULT_BODY_LIMIT): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError(maxBytes);

  const text = await readText(request, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError({ body: ["Expected a JSON body"] }, "Malformed JSON");
  }
}

async function readText(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Over a rate limit; carries the seconds until the caller may try again. */
export class RateLimitedError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super("Too many attempts. Try again later.");
    this.name = "RateLimitedError";
    this.retryAfter = Math.max(1, retryAfter);
  }
}
