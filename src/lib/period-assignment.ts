/**
 * Mirrors the PeriodAssignment enum in schema.prisma.
 *
 * Declared here rather than imported from the generated client so the pure
 * domain modules — and their tests — do not require a generated client to
 * typecheck or run. The migration that changes the enum must change this too.
 */
export type PeriodAssignment = "AUTO" | "FIRST" | "SECOND";
