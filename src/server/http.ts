/**
 * Response shape for /api/v1.
 *
 * Fixed from the start because a future client — a phone app, a script — should
 * not have to special-case endpoints. Create and update return the full record,
 * including its id and timestamps; errors share one envelope.
 */

import { NextResponse } from "next/server";
import { ConflictError, NotFoundError, ValidationError } from "./errors";

export interface ApiError {
  error: {
    code: "validation_failed" | "not_found" | "conflict" | "bad_request" | "internal";
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

  console.error("Unhandled error in API route:", error);
  return NextResponse.json<ApiError>(
    { error: { code: "internal", message: "Something went wrong" } },
    { status: 500 },
  );
}

/** Reads a JSON body, turning a malformed one into a 400 rather than a crash. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError({ body: ["Expected a JSON body"] }, "Malformed JSON");
  }
}
