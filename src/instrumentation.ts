/**
 * Runs once when the server starts:
 *  - seals any identifying text still stored in plain text (needs BANK_SYNC_KEY);
 *  - types feed accounts and links the bills balance to its bank account;
 *  - starts the daily bank sync check, which does nothing until bank sync is
 *    connected. BANK_SYNC_SCHEDULER=off turns the automatic sync off; "Sync
 *    now" in Settings still works.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { sealExistingOnce } = await import("./server/seal-existing");
  sealExistingOnce();
  // Accounts already received get their types, and the bills balance its bank account, without waiting for the next sync.
  setTimeout(() => {
    import("./server/bank/accounts")
      .then(async ({ applyTypeGuesses, autoLinkBills }) => {
        await applyTypeGuesses();
        await autoLinkBills();
      })
      .catch((error) => console.error("Accounts:", error instanceof Error ? error.message : error));
  }, 15_000).unref?.();
  if (process.env.BANK_SYNC_SCHEDULER === "off") return;
  const { startBankScheduler } = await import("./server/bank/scheduler");
  startBankScheduler();
}
