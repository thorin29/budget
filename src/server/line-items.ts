/**
 * Line items — the recurring things that make up a budget.
 *
 * `plannedAmount` is the template used for every month the item is due. A single
 * month that differs is a MonthlyPlan override and does not disturb it.
 *
 * Money crosses this boundary as integer cents. The database column is
 * Decimal(12,2); conversion happens here and nowhere else.
 */

import { safeHttpUrl } from "@/lib/safe-url";
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
  /** INCOME only: the pay calendar it arrives on, if any. */
  payScheduleId: string | null;
  plannedAmountCents: Cents;
  dueDay: number | null;
  periodAssignment: PeriodAssignment;
  /** Paid from what is left after the bills; kept out of the cash figures. */
  paidFromSurplus: boolean;
  autoRecord: boolean;
  /** A card-payment bill: the card it pays (a credit card account), and whether the person picked it. */
  paysCardId: string | null;
  paysCardLocked: boolean;
  /** Paying off a balance: what was left as of a date, or a loan account in the feed to follow. */
  payoffBalanceCents: Cents | null;
  payoffAsOf: string | null;
  payoffAccountId: string | null;
  /** INCOME: which payday of the month (1st, 2nd…); 0 or null for its due day. */
  paydayNumber: number | null;
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
    payScheduleId: z.string().trim().min(1).nullish(),
    plannedAmountCents: z.number().int().min(0, "Cannot be negative"),
    dueDay: z.number().int().min(1).max(31).nullish(),
    periodAssignment: z.enum(PERIOD_ASSIGNMENTS).default("AUTO"),
    paidFromSurplus: z.boolean().optional(),
    autoRecord: z.boolean().optional(),
    /** "auto" to let the bank work it out, "none" for not a card payment, or a credit card account id. */
    paysCard: z.string().trim().min(1).nullish(),
    payoffBalanceCents: z.number().int().min(0).nullish(),
    payoffAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date").nullish(),
    payoffAccountId: z.string().trim().min(1).nullish(),
    paydayNumber: z.number().int().min(0).max(5).nullish(),
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
    paymentUrl: z
      .union([
        z.literal(""),
        z.string().refine((v) => safeHttpUrl(v) !== null, "Must be a full http:// or https:// address"),
      ])
      .nullish(),
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
  payScheduleId: string | null;
  plannedAmount: { toString(): string };
  dueDay: number | null;
  periodAssignment: string;
  paidFromSurplus: boolean;
  autoRecord?: boolean;
  paysCardId?: string | null;
  paysCardLocked?: boolean;
  payoffBalance?: { toString(): string } | null;
  payoffAsOf?: Date | null;
  payoffAccountId?: string | null;
  paydayNumber?: number | null;
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
    payScheduleId: row.payScheduleId,
    plannedAmountCents: toCents(row.plannedAmount),
    dueDay: row.dueDay,
    periodAssignment: row.periodAssignment as PeriodAssignment,
    paidFromSurplus: row.paidFromSurplus,
    autoRecord: row.autoRecord ?? true,
    paysCardId: row.paysCardId ?? null,
    paysCardLocked: row.paysCardLocked ?? false,
    payoffBalanceCents: row.payoffBalance ? toCents(row.payoffBalance) : null,
    payoffAsOf: row.payoffAsOf ? row.payoffAsOf.toISOString().slice(0, 10) : null,
    payoffAccountId: row.payoffAccountId ?? null,
    paydayNumber: row.paydayNumber ?? null,
    scheduleKind: row.scheduleKind as ScheduleKind,
    months: row.months,
    onlyYear: row.onlyYear,
    startYear: row.startYear,
    startMonth: row.startMonth,
    endYear: row.endYear,
    endMonth: row.endMonth,
    paymentUrl: safeHttpUrl(row.paymentUrl),
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
    payScheduleId: data.kind === "INCOME" ? (data.payScheduleId ?? null) : null,
    plannedAmount: toDecimalString(data.plannedAmountCents),
    dueDay: data.dueDay ?? null,
    periodAssignment: data.periodAssignment,
    paidFromSurplus: data.kind === "INCOME" ? false : (data.paidFromSurplus ?? false),
    ...(data.autoRecord === undefined ? {} : { autoRecord: data.autoRecord }),
    ...paysCardData(data.kind, data.paysCard),
    ...(data.payoffBalanceCents === undefined && data.payoffAccountId === undefined
      ? {}
      : data.kind === "INCOME"
        ? { payoffBalance: null, payoffAsOf: null, payoffAccountId: null }
        : {
            payoffAccountId: data.payoffAccountId ?? null,
            payoffBalance: data.payoffAccountId || data.payoffBalanceCents == null ? null : toDecimalString(data.payoffBalanceCents),
            payoffAsOf: data.payoffAccountId || data.payoffBalanceCents == null ? null : new Date(`${data.payoffAsOf ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`),
          }),
    ...(data.paydayNumber === undefined ? {} : { paydayNumber: data.kind === "INCOME" ? data.paydayNumber : null }),
    scheduleKind: data.scheduleKind,
    months: monthsForSchedule(data.scheduleKind, data.anchorMonth, data.months ?? []),
    onlyYear: data.scheduleKind === "ONE_OFF" ? (data.onlyYear ?? null) : null,
    startYear: data.startYear ?? null,
    startMonth: data.startMonth ?? null,
    endYear: data.endYear ?? null,
    endMonth: data.endMonth ?? null,
    paymentUrl: safeHttpUrl(data.paymentUrl),
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
  const before = await getLineItem(id);
  const data = await toRowData(parse(input));
  // A due day the person changes is theirs; the bank stops moving it.
  const lock = data.dueDay !== before.dueDay ? { dueDayLocked: true, dueDayPrevious: null, dueDayChangedAt: null } : {};
  const row = await prisma.lineItem.update({
    where: { id },
    data: { ...data, ...lock },
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

/**
 * Deletes the item and everything recorded against it (payments, planned amounts, bank-matching
 * rules), for an old or duplicate row the person wants gone from the list. The bank charges it was
 * matched to stay: they go to `chargesTo` (kept as the person's choice), or with none back to the
 * category their merchant would get anyway. Returns how many charges were let go.
 */
export async function deleteLineItemForGood(id: string, chargesTo: string | null): Promise<{ deleted: true; charges: number }> {
  await getLineItem(id);
  if (chargesTo) {
    const category = await prisma.category.findUnique({ where: { id: chargesTo }, select: { id: true } });
    if (!category) throw new ValidationError({ chargesTo: ["Pick a category"] });
  }
  const matched = (await prisma.actualEntry.findMany({
    where: { lineItemId: id, bankTransactionId: { not: null } },
    select: { bankTransactionId: true },
  })) as Array<{ bankTransactionId: string }>;
  const ids = matched.map((m) => m.bankTransactionId);

  await prisma.$transaction([
    prisma.reviewDismissal.deleteMany({ where: { kind: "match", key: { startsWith: `${id}:` } } }),
    prisma.lineItem.delete({ where: { id } }),
    // A category picked here wins; with none, a category the person set on a charge stays.
    chargesTo
      ? prisma.bankTransaction.updateMany({ where: { id: { in: ids } }, data: { categoryId: chargesTo, categorySource: "person" } })
      : prisma.bankTransaction.updateMany({ where: { id: { in: ids }, categorySource: { not: "person" } }, data: { categorySource: "guess" } }),
  ]);
  if (!chargesTo && ids.length) {
    const { applyCategories } = await import("./categorize");
    await applyCategories(ids);
  }
  return { deleted: true, charges: ids.length };
}

/** What's recorded against an item, so a person can tell whether deleting it loses anything. */
export async function lineItemHistory(id: string): Promise<{ payments: number; paidCents: number; firstPaid: string | null; lastPaid: string | null; plannedMonths: number; firstPlanned: string | null; lastPlanned: string | null }> {
  const ym = (r: { year: number; month: number }) => `${r.year}-${String(r.month).padStart(2, "0")}`;
  const [actuals, plans] = (await Promise.all([
    prisma.actualEntry.findMany({ where: { lineItemId: id }, select: { year: true, month: true, amount: true } }),
    prisma.monthlyPlan.findMany({ where: { lineItemId: id }, select: { year: true, month: true } }),
  ])) as [Array<{ year: number; month: number; amount: { toString(): string } }>, Array<{ year: number; month: number }>];
  const a = actuals.map(ym).sort();
  const p = plans.map(ym).sort();
  return {
    payments: actuals.length,
    paidCents: actuals.reduce((t, r) => t + toCents(r.amount), 0),
    firstPaid: a[0] ?? null,
    lastPaid: a[a.length - 1] ?? null,
    plannedMonths: plans.length,
    firstPlanned: p[0] ?? null,
    lastPlanned: p[p.length - 1] ?? null,
  };
}

/**
 * Moves one item's history into another (two lines for the same bill) and deletes it: its
 * payments, its months' amounts and its bank-matching rules. A month both already have keeps the
 * other item's entry. Returns what moved and what was left out that way.
 */
export async function mergeLineItem(fromId: string, intoId: string): Promise<{ payments: number; months: number; skipped: number }> {
  if (fromId === intoId) throw new ValidationError({ intoId: ["Pick a different line"] });
  await getLineItem(fromId);
  await getLineItem(intoId);
  const key = (r: { year: number; month: number }) => `${r.year}-${r.month}`;
  const [fromActuals, intoActuals, fromPlans, intoPlans, fromRules, intoRules] = (await Promise.all([
    prisma.actualEntry.findMany({ where: { lineItemId: fromId }, select: { id: true, year: true, month: true } }),
    prisma.actualEntry.findMany({ where: { lineItemId: intoId }, select: { year: true, month: true } }),
    prisma.monthlyPlan.findMany({ where: { lineItemId: fromId }, select: { id: true, year: true, month: true } }),
    prisma.monthlyPlan.findMany({ where: { lineItemId: intoId }, select: { year: true, month: true } }),
    prisma.billRule.findMany({ where: { lineItemId: fromId }, select: { id: true, merchantKey: true } }),
    prisma.billRule.findMany({ where: { lineItemId: intoId }, select: { merchantKey: true } }),
  ])) as [
    Array<{ id: string; year: number; month: number }>, Array<{ year: number; month: number }>,
    Array<{ id: string; year: number; month: number }>, Array<{ year: number; month: number }>,
    Array<{ id: string; merchantKey: string }>, Array<{ merchantKey: string }>,
  ];
  const paid = new Set(intoActuals.map(key));
  const planned = new Set(intoPlans.map(key));
  const ruled = new Set(intoRules.map((r) => r.merchantKey));
  const moveActuals = fromActuals.filter((r) => !paid.has(key(r))).map((r) => r.id);
  const movePlans = fromPlans.filter((r) => !planned.has(key(r))).map((r) => r.id);
  const moveRules = fromRules.filter((r) => !ruled.has(r.merchantKey)).map((r) => r.id);
  await prisma.$transaction([
    prisma.actualEntry.updateMany({ where: { id: { in: moveActuals } }, data: { lineItemId: intoId } }),
    prisma.monthlyPlan.updateMany({ where: { id: { in: movePlans } }, data: { lineItemId: intoId } }),
    prisma.billRule.updateMany({ where: { id: { in: moveRules } }, data: { lineItemId: intoId } }),
    prisma.reviewDismissal.deleteMany({ where: { kind: "match", key: { startsWith: `${fromId}:` } } }),
    prisma.lineItem.delete({ where: { id: fromId } }),
  ]);
  return { payments: moveActuals.length, months: movePlans.length, skipped: fromActuals.length - moveActuals.length + (fromPlans.length - movePlans.length) };
}

/** The form's card choice as columns: left alone when not sent. */
function paysCardData(kind: string, choice: string | null | undefined): { paysCardId?: string | null; paysCardLocked?: boolean } {
  if (choice === undefined || choice === null) return {};
  if (kind === "INCOME" || choice === "none") return { paysCardId: null, paysCardLocked: kind !== "INCOME" };
  if (choice === "auto") return { paysCardLocked: false };
  return { paysCardId: choice, paysCardLocked: true };
}

async function assertReferencesExist(data: ReturnType<typeof parse>): Promise<void> {
  const issues: Record<string, string[]> = {};

  if (data.payoffAccountId) {
    const loan = await prisma.bankAccount.findUnique({ where: { id: data.payoffAccountId }, select: { type: true } });
    if (!loan) issues.payoffAccountId = ["Pick an account"];
  }
  if (data.paysCard && data.paysCard !== "auto" && data.paysCard !== "none") {
    const account = await prisma.account.findUnique({ where: { id: data.paysCard } });
    if (!account || account.kind !== "CREDIT_CARD") issues.paysCard = ["Pick a credit card"];
  }

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

  if (data.payScheduleId && data.kind === "INCOME") {
    const found = await prisma.paySchedule.count({ where: { id: data.payScheduleId } });
    if (!found) issues.payScheduleId = ["No such pay schedule"];
  }

  if (Object.keys(issues).length) throw new ValidationError(issues);
}
