/**
 * Runs once when the server starts:
 *  - seals any identifying text still stored in plain text (needs BANK_SYNC_KEY);
 *  - starts the daily bank sync check, which does nothing until bank sync is
 *    connected. BANK_SYNC_SCHEDULER=off turns the automatic sync off; "Sync
 *    now" in Settings still works.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { sealExistingOnce } = await import("./server/seal-existing");
  sealExistingOnce();
  if (process.env.BANK_SYNC_SCHEDULER === "off") return;
  const { startBankScheduler } = await import("./server/bank/scheduler");
  startBankScheduler();
}
