/**
 * Domain errors. Route handlers and server actions translate these into
 * responses; nothing else should be throwing bare strings.
 */

export class ValidationError extends Error {
  readonly issues: Record<string, string[]>;

  constructor(issues: Record<string, string[]>, message = "Validation failed") {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Prisma's unique-constraint failure, without importing its error classes. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
