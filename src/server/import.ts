/**
 * Importing a workbook.
 *
 * The spreadsheet parsing happens outside this application; what arrives here is
 * a JSON document. Nothing is written until the user has seen a plan and
 * approved it, and every import is recorded as a batch that can be undone whole.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ValidationError, NotFoundError } from "./errors";
import { toCents } from "@/lib/money";
import type { ScheduleKind } from "@/lib/schedule";

const amount = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Not a monetary amount");

const documentSchema = z.object({
  version: z.literal(1),
  year: z.number().int().min(1900).max(2999),
  sourceLabel: z.string().min(1).max(120),
  accounts: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1).max(80),
      suggestedKind: z.enum(["BANK", "CREDIT_CARD", "CASH", "OTHER"]).default("BANK"),
    }),
  ),
  categories: z.array(z.object({ name: z.string().min(1).max(60) })),
  lineItems: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1).max(80),
      suggestedKind: z.enum(["BILL", "SETTLEMENT", "INCOME"]),
      categoryName: z.string().max(60).nullish(),
      accountKey: z.string().nullish(),
      plannedAmount: amount,
      dueDay: z.number().int().min(1).max(31).nullish(),
      months: z.array(z.number().int().min(1).max(12)).min(1),
      frequencyLabel: z.string().nullish(),
      paymentUrl: z.string().nullish(),
      monthlyOverrides: z.array(z.object({ month: z.number().int().min(1).max(12), amount })),
      actuals: z.array(z.object({ month: z.number().int().min(1).max(12), amount })),
      warnings: z.array(z.string()).default([]),
    }),
  ),
  payDates: z.array(z.string()).default([]),
  skipped: z
    .array(z.object({ row: z.number(), name: z.string().nullable(), reason: z.string() }))
    .default([]),
  notes: z.array(z.string()).default([]),
});

export type ImportDocument = z.infer<typeof documentSchema>;

export interface ImportChoices {
  /** Line item keys to bring across. Anything absent is left behind. */
  includeKeys: string[];
  /** Overrides the suggested kind, per line item key. */
  kinds: Record<string, "BILL" | "SETTLEMENT" | "INCOME">;
  /** Overrides the suggested account kind, per account key. */
  accountKinds: Record<string, "BANK" | "CREDIT_CARD" | "CASH" | "OTHER">;
}

export interface ImportPlan {
  year: number;
  sourceLabel: string;
  accounts: Array<{ key: string; name: string; kind: string; exists: boolean }>;
  categories: Array<{ name: string; exists: boolean }>;
  lineItems: Array<{
    key: string;
    name: string;
    kind: string;
    exists: boolean;
    plannedAmount: string;
    dueDay: number | null;
    monthCount: number;
    overrideCount: number;
    actualCount: number;
    accountName: string | null;
    categoryName: string | null;
    hasPaymentUrl: boolean;
    warnings: string[];
  }>;
  totals: { lineItems: number; overrides: number; actuals: number };
  skipped: ImportDocument["skipped"];
  notes: string[];
  payDateCount: number;
}

export function parseDocument(input: unknown): ImportDocument {
  const result = documentSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      z.flattenError(result.error).fieldErrors as Record<string, string[]>,
      "This does not look like an import document",
    );
  }
  return result.data;
}

/** What the import would do, without doing it. */
export async function buildPlan(
  document: ImportDocument,
  choices: Partial<ImportChoices> = {},
): Promise<ImportPlan> {
  const include = new Set(choices.includeKeys ?? document.lineItems.map((i) => i.key));

  const [existingAccounts, existingCategories, existingItems] = (await Promise.all([
    prisma.account.findMany({ select: { name: true } }),
    prisma.category.findMany({ select: { name: true } }),
    prisma.lineItem.findMany({ select: { name: true } }),
  ])) as [Array<{ name: string }>, Array<{ name: string }>, Array<{ name: string }>];

  const accountNames = new Set(existingAccounts.map((a) => a.name));
  const categoryNames = new Set(existingCategories.map((c) => c.name));
  const itemNames = new Set(existingItems.map((i) => i.name));

  const accountByKey = new Map(document.accounts.map((a) => [a.key, a]));
  const selected = document.lineItems.filter((i) => include.has(i.key));

  return {
    year: document.year,
    sourceLabel: document.sourceLabel,
    accounts: document.accounts.map((a) => ({
      key: a.key,
      name: a.name,
      kind: choices.accountKinds?.[a.key] ?? a.suggestedKind,
      exists: accountNames.has(a.name),
    })),
    categories: document.categories.map((c) => ({
      name: c.name,
      exists: categoryNames.has(c.name),
    })),
    lineItems: selected.map((item) => ({
      key: item.key,
      name: item.name,
      kind: choices.kinds?.[item.key] ?? item.suggestedKind,
      exists: itemNames.has(item.name),
      plannedAmount: item.plannedAmount,
      dueDay: item.dueDay ?? null,
      monthCount: item.months.length,
      overrideCount: item.monthlyOverrides.length,
      actualCount: item.actuals.length,
      accountName: item.accountKey
        ? (accountByKey.get(item.accountKey)?.name ?? null)
        : null,
      categoryName: item.categoryName ?? null,
      hasPaymentUrl: Boolean(item.paymentUrl),
      warnings: item.warnings,
    })),
    totals: {
      lineItems: selected.length,
      overrides: selected.reduce((s, i) => s + i.monthlyOverrides.length, 0),
      actuals: selected.reduce((s, i) => s + i.actuals.length, 0),
    },
    skipped: document.skipped,
    notes: document.notes,
    payDateCount: document.payDates.length,
  };
}

export interface ImportResult {
  batchId: string;
  created: { accounts: number; categories: number; lineItems: number };
  written: { overrides: number; actuals: number };
}

/**
 * Applies the plan. Accounts, categories and line items are matched by name, so
 * running the same import twice updates rather than duplicating.
 */
export async function applyImport(
  document: ImportDocument,
  choices: Partial<ImportChoices> = {},
): Promise<ImportResult> {
  const include = new Set(choices.includeKeys ?? document.lineItems.map((i) => i.key));
  const selected = document.lineItems.filter((i) => include.has(i.key));

  const batch = await prisma.importBatch.create({
    data: {
      label: document.sourceLabel,
      year: document.year,
      rowCount: selected.length,
    },
  });

  const created = { accounts: 0, categories: 0, lineItems: 0 };
  const written = { overrides: 0, actuals: 0 };
  const createdIds = { accounts: [] as string[], categories: [] as string[], lineItems: [] as string[] };

  // Accounts.
  const accountIdByKey = new Map<string, string>();
  for (const account of document.accounts) {
    const kind = choices.accountKinds?.[account.key] ?? account.suggestedKind;
    const existing = await prisma.account.findUnique({ where: { name: account.name } });
    if (existing) {
      accountIdByKey.set(account.key, existing.id);
      continue;
    }
    const row = await prisma.account.create({ data: { name: account.name, kind } });
    accountIdByKey.set(account.key, row.id);
    createdIds.accounts.push(row.id);
    created.accounts += 1;
  }

  // Categories.
  const categoryIdByName = new Map<string, string>();
  for (const category of document.categories) {
    const existing = await prisma.category.findUnique({ where: { name: category.name } });
    if (existing) {
      categoryIdByName.set(category.name, existing.id);
      continue;
    }
    const row = await prisma.category.create({ data: { name: category.name } });
    categoryIdByName.set(category.name, row.id);
    createdIds.categories.push(row.id);
    created.categories += 1;
  }

  // Line items, with their overrides and actuals.
  for (const item of selected) {
    const kind = choices.kinds?.[item.key] ?? item.suggestedKind;
    // Annotated rather than inferred: a bare ternary widens to `string`, which
    // the generated client rejects for an enum column.
    const scheduleKind: ScheduleKind = item.months.length === 12 ? "MONTHLY" : "CUSTOM";

    const data = {
      name: item.name,
      kind,
      categoryId: item.categoryName ? (categoryIdByName.get(item.categoryName) ?? null) : null,
      paidFromId: item.accountKey ? (accountIdByKey.get(item.accountKey) ?? null) : null,
      plannedAmount: item.plannedAmount,
      dueDay: item.dueDay ?? null,
      months: item.months,
      scheduleKind,
      paymentUrl: item.paymentUrl || null,
    };

    const existing = await prisma.lineItem.findFirst({ where: { name: item.name } });
    const row = existing
      ? await prisma.lineItem.update({ where: { id: existing.id }, data })
      : await prisma.lineItem.create({ data });

    if (!existing) {
      createdIds.lineItems.push(row.id);
      created.lineItems += 1;
    }

    for (const override of item.monthlyOverrides) {
      await prisma.monthlyPlan.upsert({
        where: {
          lineItemId_year_month: {
            lineItemId: row.id,
            year: document.year,
            month: override.month,
          },
        },
        create: {
          lineItemId: row.id,
          year: document.year,
          month: override.month,
          amount: override.amount,
        },
        update: { amount: override.amount },
      });
      written.overrides += 1;
    }

    for (const actual of item.actuals) {
      await prisma.actualEntry.upsert({
        where: {
          lineItemId_year_month: {
            lineItemId: row.id,
            year: document.year,
            month: actual.month,
          },
        },
        create: {
          lineItemId: row.id,
          year: document.year,
          month: actual.month,
          amount: actual.amount,
          source: "import",
          importBatch: batch.id,
        },
        update: {
          amount: actual.amount,
          source: "import",
          importBatch: batch.id,
        },
      });
      written.actuals += 1;
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      finishedAt: new Date(),
      summary: { created, written, createdIds } as never,
    },
  });

  return { batchId: batch.id, created, written };
}

export interface ImportBatchSummary {
  id: string;
  label: string;
  year: number;
  rowCount: number;
  startedAt: string;
  finishedAt: string | null;
  revertedAt: string | null;
}

export async function listImportBatches(): Promise<ImportBatchSummary[]> {
  const rows = (await prisma.importBatch.findMany({
    orderBy: { startedAt: "desc" },
    take: 25,
  })) as Array<{
    id: string;
    label: string;
    year: number;
    rowCount: number;
    startedAt: Date;
    finishedAt: Date | null;
    revertedAt: Date | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    year: r.year,
    rowCount: r.rowCount,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    revertedAt: r.revertedAt ? r.revertedAt.toISOString() : null,
  }));
}

/**
 * Undoes an import: removes the actuals it wrote and anything it created that
 * has not since been used. Rows that already existed are left alone — the import
 * updated them, and there is no record of what they said before.
 */
export async function revertImport(batchId: string): Promise<{ removed: number }> {
  const batch = (await prisma.importBatch.findUnique({ where: { id: batchId } })) as {
    id: string;
    revertedAt: Date | null;
    summary: { createdIds?: { accounts: string[]; categories: string[]; lineItems: string[] } } | null;
  } | null;

  if (!batch) throw new NotFoundError("Import");
  if (batch.revertedAt) throw new ValidationError({ batch: ["Already reverted"] });

  const removed = await prisma.actualEntry.deleteMany({ where: { importBatch: batchId } });

  const createdIds = batch.summary?.createdIds;
  if (createdIds) {
    for (const id of createdIds.lineItems ?? []) {
      const remaining = await prisma.actualEntry.count({ where: { lineItemId: id } });
      if (remaining === 0) {
        await prisma.monthlyPlan.deleteMany({ where: { lineItemId: id } });
        await prisma.lineItem.delete({ where: { id } }).catch(() => undefined);
      }
    }
    for (const id of createdIds.categories ?? []) {
      const inUse = await prisma.lineItem.count({ where: { categoryId: id } });
      if (inUse === 0) await prisma.category.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of createdIds.accounts ?? []) {
      const inUse = await prisma.lineItem.count({ where: { paidFromId: id } });
      if (inUse === 0) await prisma.account.delete({ where: { id } }).catch(() => undefined);
    }
  }

  await prisma.importBatch.update({
    where: { id: batchId },
    data: { revertedAt: new Date() },
  });

  return { removed: removed.count };
}

/** Sanity check used by the review screen: amounts must survive conversion. */
export function validateAmounts(document: ImportDocument): string[] {
  const problems: string[] = [];
  for (const item of document.lineItems) {
    const all = [
      item.plannedAmount,
      ...item.monthlyOverrides.map((o) => o.amount),
      ...item.actuals.map((a) => a.amount),
    ];
    for (const value of all) {
      try {
        toCents(value);
      } catch {
        problems.push(`${item.name}: cannot read the amount "${value}"`);
      }
    }
  }
  return problems;
}
