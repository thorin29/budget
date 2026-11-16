/**
 * Runs once when the server starts. Starts the daily bank sync check, which
 * does nothing until bank sync is connected. BANK_SYNC_SCHEDULER=off turns
 * the automatic sync off; "Sync now" in Settings still works.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.BANK_SYNC_SCHEDULER === "off") return;
  const { startBankScheduler } = await import("./server/bank/scheduler");
  startBankScheduler();
}
