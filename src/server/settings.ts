/**
 * Application settings.
 *
 * Environment variables seed the defaults; once a value is written here it
 * wins, so the interface can change a setting without touching the container.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "./errors";
import {
  DEFAULT_HORIZON_DAYS,
  DEFAULT_SPLIT_DAY,
  DEFAULT_BUFFER,
  SETTING_KEYS,
} from "@/lib/settings";

export interface Settings {
  /** Day of the month the planning split falls on. */
  splitDay: number;
  /** Days the cash projection looks ahead. */
  horizonDays: number;
  /** Floor to keep in the bills account, in cents. Zero by default. */
  bufferCents: number;
  /** The account "current in bills" refers to. */
  billsAccountId: string | null;
  setupComplete: boolean;
}

const settingsInput = z.object({
  splitDay: z.number().int().min(1).max(28),
  horizonDays: z.number().int().min(7).max(365),
  bufferCents: z.number().int().min(0),
  billsAccountId: z.string().trim().min(1).nullable(),
  setupComplete: z.boolean().optional(),
});

export type SettingsInput = z.input<typeof settingsInput>;

export async function getSettings(): Promise<Settings> {
  const rows: Array<{ key: string; value: unknown }> = await prisma.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const read = <T>(key: string, fallback: T): T => {
    const value = stored.get(key);
    return value === undefined || value === null ? fallback : (value as T);
  };

  return {
    splitDay: read(SETTING_KEYS.splitDay, DEFAULT_SPLIT_DAY),
    horizonDays: read(SETTING_KEYS.horizonDays, DEFAULT_HORIZON_DAYS),
    bufferCents: read(SETTING_KEYS.buffer, DEFAULT_BUFFER),
    billsAccountId: read<string | null>(SETTING_KEYS.billsAccountId, null),
    setupComplete: read(SETTING_KEYS.setupComplete, false),
  };
}

export async function updateSettings(input: SettingsInput): Promise<Settings> {
  const result = settingsInput.safeParse(input);
  if (!result.success) {
    throw new ValidationError(z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  const data = result.data;

  if (data.billsAccountId) {
    const account = await prisma.account.findUnique({ where: { id: data.billsAccountId } });
    if (!account) throw new ValidationError({ billsAccountId: ["No such account"] });
    if (account.kind !== "BANK") {
      throw new ValidationError({
        billsAccountId: ["The bills account must be a bank account"],
      });
    }
  }

  const entries: Array<[string, unknown]> = [
    [SETTING_KEYS.splitDay, data.splitDay],
    [SETTING_KEYS.horizonDays, data.horizonDays],
    [SETTING_KEYS.buffer, data.bufferCents],
    [SETTING_KEYS.billsAccountId, data.billsAccountId],
  ];
  if (data.setupComplete !== undefined) {
    entries.push([SETTING_KEYS.setupComplete, data.setupComplete]);
  }

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      }),
    ),
  );

  return getSettings();
}

/** Marks setup finished without disturbing the other settings. */
export async function markSetupComplete(): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.setupComplete },
    create: { key: SETTING_KEYS.setupComplete, value: true },
    update: { value: true },
  });
}
