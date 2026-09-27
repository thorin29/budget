/**
 * The pay calendar.
 *
 * A reference calendar only: it tells the projection when money is expected to
 * arrive. No month boundary, half, or total is derived from it — the month
 * splits at a fixed day, which is a separate setting.
 *
 * Schedules are versioned rather than edited. Changing frequency adds a row with
 * a new activeFrom, so past months still resolve against what was true then.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "./errors";
import { payDatesBetween, stripTime, utcDate } from "@/lib/month-model";

export const PAY_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export interface PaySchedule {
  id: string;
  name: string;
  frequency: PayFrequency;
  /** ISO date, no time component. */
  anchorDate: string | null;
  daysOfMonth: number[];
  activeFrom: string;
  activeTo: string | null;
  createdAt: string;
  updatedAt: string;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the form YYYY-MM-DD");

const scheduleInput = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    frequency: z.enum(PAY_FREQUENCIES),
    anchorDate: isoDate.nullish(),
    daysOfMonth: z.array(z.number().int().min(1).max(31)).max(4).optional(),
    activeFrom: isoDate,
    activeTo: isoDate.nullish(),
  })
  .superRefine((value, ctx) => {
    if ((value.frequency === "WEEKLY" || value.frequency === "BIWEEKLY") && !value.anchorDate) {
      ctx.addIssue({
        code: "custom",
        path: ["anchorDate"],
        message: "A known payday is needed to count from",
      });
    }
    if (
      (value.frequency === "SEMI_MONTHLY" || value.frequency === "MONTHLY") &&
      (!value.daysOfMonth || value.daysOfMonth.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["daysOfMonth"],
        message: "Give the day or days of the month",
      });
    }
    if (value.activeTo && value.activeTo < value.activeFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["activeTo"],
        message: "The end cannot precede the start",
      });
    }
  });

export type PayScheduleInput = z.input<typeof scheduleInput>;

const asIsoDate = (d: Date): string => d.toISOString().slice(0, 10);
const fromIsoDate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return utcDate(y, m, d);
};

type Row = {
  id: string;
  name: string;
  frequency: string;
  anchorDate: Date | null;
  daysOfMonth: number[];
  activeFrom: Date;
  activeTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const toSchedule = (row: Row): PaySchedule => ({
  id: row.id,
  name: row.name,
  frequency: row.frequency as PayFrequency,
  anchorDate: row.anchorDate ? asIsoDate(row.anchorDate) : null,
  daysOfMonth: row.daysOfMonth,
  activeFrom: asIsoDate(row.activeFrom),
  activeTo: row.activeTo ? asIsoDate(row.activeTo) : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

function parse(input: unknown) {
  const result = scheduleInput.safeParse(input);
  if (!result.success) {
    throw new ValidationError(z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

export async function listPaySchedules(): Promise<PaySchedule[]> {
  const rows = await prisma.paySchedule.findMany({ orderBy: { activeFrom: "desc" } });
  return rows.map(toSchedule);
}

export async function getPaySchedule(id: string): Promise<PaySchedule> {
  const row = await prisma.paySchedule.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Pay schedule");
  return toSchedule(row);
}

export async function createPaySchedule(input: PayScheduleInput): Promise<PaySchedule> {
  const data = parse(input);
  const row = await prisma.paySchedule.create({
    data: {
      name: data.name,
      frequency: data.frequency,
      anchorDate: data.anchorDate ? fromIsoDate(data.anchorDate) : null,
      daysOfMonth: data.daysOfMonth ?? [],
      activeFrom: fromIsoDate(data.activeFrom),
      activeTo: data.activeTo ? fromIsoDate(data.activeTo) : null,
    },
  });
  return toSchedule(row);
}

export async function updatePaySchedule(
  id: string,
  input: PayScheduleInput,
): Promise<PaySchedule> {
  const data = parse(input);
  await getPaySchedule(id);
  const row = await prisma.paySchedule.update({
    where: { id },
    data: {
      name: data.name,
      frequency: data.frequency,
      anchorDate: data.anchorDate ? fromIsoDate(data.anchorDate) : null,
      daysOfMonth: data.daysOfMonth ?? [],
      activeFrom: fromIsoDate(data.activeFrom),
      activeTo: data.activeTo ? fromIsoDate(data.activeTo) : null,
    },
  });
  return toSchedule(row);
}

export async function deletePaySchedule(id: string): Promise<void> {
  await getPaySchedule(id);
  await prisma.paySchedule.delete({ where: { id } });
}

/**
 * The paydays a schedule produces over a range, as ISO dates. Used to preview a
 * schedule during setup so it can be checked against reality before it is
 * relied on.
 */
export function previewPayDates(
  schedule: Pick<PaySchedule, "frequency" | "anchorDate" | "daysOfMonth">,
  from: Date,
  to: Date,
): string[] {
  return payDatesBetween(
    schedule.frequency,
    schedule.anchorDate ? fromIsoDate(schedule.anchorDate) : null,
    schedule.daysOfMonth,
    stripTime(from),
    stripTime(to),
  ).map(asIsoDate);
}
