/**
 * The scheduled sync. Started once per server process from src/instrumentation.ts.
 *
 * Every 5 minutes it checks whether a sync is due: every BANK_SYNC_EVERY_HOURS
 * hours (4 by default) from BANK_SYNC_HOUR, at 17 past, with a failed attempt
 * retried an hour later. Bridges limit requests per day (SimpleFIN: 24), so
 * the sync also stops at a daily cap; see src/lib/bank-schedule.ts.
 */

import { configuredKey } from "@/lib/secret-box";
import { isDue } from "@/lib/bank-schedule";
import { getConnection, syncBank } from "./sync";

const TICK_MS = 5 * 60_000;

declare global {
  var __budgetBankScheduler: boolean | undefined;
}

async function tick(): Promise<void> {
  if (!configuredKey()) return;
  const connection = await getConnection();
  if (!connection) return;
  if (!isDue(new Date(), connection.lastSuccessAt, connection.lastSyncAt)) return;
  try {
    const result = await syncBank();
    console.log(`Bank sync: ${result.accounts} accounts, ${result.added} new, ${result.updated} updated.`);
  } catch (error) {
    console.error("Bank sync:", error instanceof Error ? error.message : error);
  }
}

export function startBankScheduler(): void {
  if (globalThis.__budgetBankScheduler) return;
  globalThis.__budgetBankScheduler = true;
  const run = () => void tick().catch((error) => console.error("Bank sync scheduler:", error));
  setTimeout(run, 60_000).unref?.();
  setInterval(run, TICK_MS).unref?.();
}
