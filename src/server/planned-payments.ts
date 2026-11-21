/**
 * Payments set on the Payments page: how much, and on what day, for one card statement, one 0%
 * payment or one bill. A card's is keyed by its statement date, so a new statement starts clean.
 * The Tracker's card-payment line uses it (statement-plan.ts); a 0% payment or bill also gets that
 * month's amount on the Tracker. The bank's payment, once it posts, is recorded as usual.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "./errors";

const KEY = "plannedPayments";

export interface PlannedPayment {
  cents: number;
  /** YYYY-MM-DD */
  on: string;
}

const Entry = z.object({ cents: z.number().int().min(0).max(100_000_000), on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const paymentKey = {
  card: (cardId: string, closedOn: string) => `card:${cardId}:${closedOn}`,
  debt: (cardId: string, dueOn: string) => `debt:${cardId}:${dueOn}`,
  bill: (lineItemId: string, dueOn: string) => `bill:${lineItemId}:${dueOn}`,
};

export async function plannedPayments(): Promise<Record<string, PlannedPayment>> {
  const row = (await prisma.setting.findUnique({ where: { key: KEY } })) as { value: unknown } | null;
  const parsed = z.record(z.string(), Entry).safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : {};
}

export async function setPlannedPayment(key: string, value: PlannedPayment | null): Promise<void> {
  if (!/^(card|debt|bill):[\w-]+:\d{4}-\d{2}-\d{2}$/.test(key)) throw new ValidationError({ key: ["Unknown payment"] });
  if (value && !Entry.safeParse(value).success) throw new ValidationError({ amount: ["Enter an amount and a date"] });
  const all = await plannedPayments();
  if (value) all[key] = value;
  else delete all[key];
  // Old ones go after a few months.
  const cutoff = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  for (const k of Object.keys(all)) if (k.slice(-10) < cutoff) delete all[k];
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: all as never }, update: { value: all as never } });
}
