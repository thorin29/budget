/**
 * Defaults for settings the user has not yet chosen. Environment variables seed
 * them; once a value is written to the Setting table, that wins.
 */

export const DEFAULT_SPLIT_DAY = Number(process.env.DEFAULT_SPLIT_DAY ?? 15);
export const DEFAULT_HORIZON_DAYS = Number(process.env.DEFAULT_HORIZON_DAYS ?? 45);
export const DEFAULT_BUFFER = 0;

export const SETTING_KEYS = {
  splitDay: "planning.splitDay",
  horizonDays: "planning.horizonDays",
  buffer: "planning.buffer",
  billsAccountId: "planning.billsAccountId",
  setupComplete: "app.setupComplete",
} as const;
