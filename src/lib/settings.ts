/**
 * Defaults for settings the user has not yet chosen. Environment variables seed
 * them; once a value is written to the Setting table, that wins.
 */

export const DEFAULT_SPLIT_DAY = Number(process.env.DEFAULT_SPLIT_DAY ?? 15);
export const DEFAULT_HORIZON_DAYS = Number(process.env.DEFAULT_HORIZON_DAYS ?? 45);
export const DEFAULT_BUFFER = 0;
/**
 * How many months back an unpaid bill keeps counting. One month by default: a
 * bill older than that is far more likely to be a gap in the record than money
 * still owed, and treating it as owed quietly distorts every available figure.
 */
export const DEFAULT_CARRY_MONTHS = Number(process.env.DEFAULT_CARRY_MONTHS ?? 1);

export const SETTING_KEYS = {
  splitDay: "planning.splitDay",
  horizonDays: "planning.horizonDays",
  buffer: "planning.buffer",
  carryMonths: "planning.carryMonths",
  billsAccountId: "planning.billsAccountId",
  setupComplete: "app.setupComplete",
} as const;
