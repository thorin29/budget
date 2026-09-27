/**
 * Line items — the recurring things that make up a budget.
 *
 * `plannedAmount` is the template used for every month the item is due. A single
 * month that differs is a MonthlyPlan override and does not disturb it.
 *
 * Money crosses this boundary as integer cents. The database column is
 * Decimal(12,2); conversion happens here and nowhere else.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "./errors";
import { toCents, toDecimalString, type Cents } from "@/lib/money";
import type { PeriodAssignment } from "@/lib/period-assignment";
import { monthsForSchedule, SCHEDULE_KINDS, type ScheduleKind } from "@/lib/schedule";

export const LINE_ITEM_KINDS = ["BILL", "SETTLEMENT", "INCOME"] as const;
export type LineItemKind = (typeof LINE_ITEM_KINDS)[number];

export { SCHEDULE_KINDS, monthsForSchedule };
export type { ScheduleKind };

export const PERIOD_ASSIGNMENTS = ["AUTO", "FIRST", "SECOND"] as const;

export interface LineItem {
  id: string;
  name: string;
  kind: LineItemKind;
  categoryId: string | null;
  paidFromId: string | null;
  chargedToId: string | null;
  plannedAmountCents: Cents;
  dueDay: number | null;
  periodAssignment: PeriodAssignment;
  scheduleKind: ScheduleKind;
  months: number[];
  onlyYear: number | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  paymentUrl: string | null;
  notes: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const lineItemInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    kind: z.enum(LINE_ITEM_KINDS),
    categoryId: z.string().trim().min(1).nullish(),
    paidFromId: z.string().trim().min(1).nullish(),
    chargedToId: z.string().trim().min(1).nullish(),
    plannedAmountCents: z.number().int().min(0, "Cannot be negative"),
    dueDay: z.number().int().min(1).max(31).nullish(),
    periodAssignment: z.enum(PERIOD_ASSIGNMENTS).default("AUTO"),
    scheduleKind: z.enum(SCHEDULE_KINDS).default("MONTHLY"),
    /** The month a non-monthly schedule is anchored to. */
    anchorMonth: z.number().int().min(1).max(12).default(1),
    /** CUSTOM only. */
    months: z.array(z.number().int().min(1).max(12)).optional(),
    onlyYear: z.number().int().min(1900).max(2999).nullish(),
    startYear: z.number().int().min(1900).max(2999).nullish(),
    startMonth: z.number().int().min(1).max(12).nullish(),
    endYear: z.number().int().min(1900).max(2999).nullish(),
    endMonth: z.number().int().min(1).max(12).nullish(),
    paymentUrl: z.union([z.literal(""), z.url("Must be a full URL")]).nullish(),
    notes: z.string().trim().max(2000).nullish(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scheduleKind === "CUSTOM" && !value.months?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["months"],
        message: "Choose at least one month",
      });
    }
    if (value.scheduleKind === "ONE_OFF" && !value.onlyYear) {
      ctx.addIssue({
        code: "custom",
        path: ["onlyYear"],
        message: "A one-off needs the year it falls in",
      });
    }
    if (value.endYear && value.startYear) {
      const start = value.startYear * 12 + (value.startMonth ?? 1);
      const end = value.endYear * 12 + (value.endMonth ?? 12);
      if (end < start) {
        ctx.addIssue({ code: "custom", path: ["endYear"], message: "The end precedes the start" });
      }
    }
  });

export type LineItemInput = z.input<typeof lineItemInput>;

function parse(input: unknown) {
  const result = lineItemInput.safeParse(input);
  if (!result.success) {
    throw new ValidationError(z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

type Row = {
  id: string;
  name: string;
  kind: string;
  categoryId: string | null;
  paidFromId: string | null;
  chargedToId: string | null;
  plannedAmount: { toString(): string };
  dueDay: number | null;
  periodAssignment: string;
  scheduleKind: string;
  months: number[];
  onlyYear: number | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  paymentUrl: string | null;
  notes: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function toLineItem(row: Row): LineItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as LineItemKind,
    categoryId: row.categoryId,
    paidFromId: row.paidFromId,
    chargedToId: row.chargedToId,
    plannedAmountCents: toCents(row.plannedAmount),
    dueDay: row.dueDay,
    periodAssignment: row.periodAssignment as PeriodAssignment,
    scheduleKind: row.scheduleKind as ScheduleKind,
    months: row.months,
    onlyYear: row.onlyYear,
    startYear: row.startYear,
    startMonth: row.startMonth,
    endYear: row.endYear,
    endMonth: row.endMonth,
    paymentUrl: row.paymentUrl,
    notes: row.notes,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listLineItems(
  options: { includeInactive?: boolean } = {},
): Promise<LineItem[]> {
  const rows = await prisma.lineItem.findMany({
    where: options.includeInactive ? undefined : { active: true },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toLineItem);
}

export async function getLineItem(id: string): Promise<LineItem> {
  const row = await prisma.lineItem.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Line item");
  return toLineItem(row);
}

async function toRowData(data: ReturnType<typeof parse>) {
  await assertReferencesExist(data);

  return {
    name: data.name,
    kind: data.kind,
    categoryId: data.categoryId ?? null,
    paidFromId: data.paidFromId ?? null,
    chargedToId: data.chargedToId ?? null,
    plannedAmount: toDecimalString(data.plannedAmountCents),
    dueDay: data.dueDay ?? null,
    periodAssignment: data.periodAssignment,
    scheduleKind: data.scheduleKind,
    months: monthsForSchedule(data.scheduleKind, data.anchorMonth, data.months ?? []),
    onlyYear: data.scheduleKind === "ONE_OFF" ? (data.onlyYear ?? null) : null,
    startYear: data.startYear ?? null,
    startMonth: data.startMonth ?? null,
    endYear: data.endYear ?? null,
    endMonth: data.endMonth ?? null,
    paymentUrl: data.paymentUrl || null,
    notes: data.notes || null,
    active: data.active ?? true,
    sortOrder: data.sortOrder ?? 0,
  };
}

export async function createLineItem(input: LineItemInput): Promise<LineItem> {
  const row = await prisma.lineItem.create({ data: await toRowData(parse(input)) });
  return toLineItem(row);
}

export async function updateLineItem(id: string, input: LineItemInput): Promise<LineItem> {
  await getLineItem(id);
  const row = await prisma.lineItem.update({
    where: { id },
    data: await toRowData(parse(input)),
  });
  return toLineItem(row);
}

/**
 * Deletes only when the item has no history. Anything with actuals or overrides
 * is deactivated instead — the past should keep making sense.
 */
export async function deleteLineItem(id: string): Promise<{ deleted: boolean }> {
  await getLineItem(id);

  const [actuals, plans] = await Promise.all([
    prisma.actualEntry.count({ where: { lineItemId: id } }),
    prisma.monthlyPlan.count({ where: { lineItemId: id } }),
  ]);

  if (actuals + plans > 0) {
    await prisma.lineItem.update({ where: { id }, data: { active: false } });
    return { deleted: false };
  }

  await prisma.lineItem.delete({ where: { id } });
  return { deleted: true };
}

async function assertReferencesExist(data: ReturnType<typeof parse>): Promise<void> {
  const issues: Record<string, string[]> = {};

  if (data.categoryId) {
    const found = await prisma.category.count({ where: { id: data.categoryId } });
    if (!found) issues.categoryId = ["No such category"];
  }
  if (data.paidFromId) {
    const found = await prisma.account.count({ where: { id: data.paidFromId } });
    if (!found) issues.paidFromId = ["No such account"];
  }
  if (data.chargedToId) {
    const account = await prisma.account.findUnique({ where: { id: data.chargedToId } });
    if (!account) issues.chargedToId = ["No such account"];
    else if (account.kind !== "CREDIT_CARD") {
      issues.chargedToId = ["Only a credit card can be charged to"];
    }
  }

  if (Object.keys(issues).length) throw new ValidationError(issues);
}
