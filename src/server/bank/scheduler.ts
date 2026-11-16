/**
 * The daily sync. Started once per server process from src/instrumentation.ts.
 *
 * Every 15 minutes it checks whether today's sync is due: at or after
 * BANK_SYNC_HOUR local time (6 by default), no successful sync yet today, and
 * no failed attempt in the last three hours. Bridges limit requests per day,
 * so this asks once a day plus a few retries, never in a tight loop.
 */

import { configuredKey } from "@/lib/secret-box";
import { isDue } from "@/lib/bank-schedule";
import { getConnection, syncBank } from "./sync";

const TICK_MS = 15 * 60_000;

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
