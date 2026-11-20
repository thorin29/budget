/**
 * Runs once when the server starts:
 *  - seals any identifying text still stored in plain text (needs BANK_SYNC_KEY);
 *  - types feed accounts and links the bills balance to its bank account;
 *  - runs any one-time fixes to saved data (src/server/data-fixes.ts);
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
        const { syncLedgerAccounts } = await import("./server/bank/ledger");
        await syncLedgerAccounts();
        // Transfers over the last few months, so a rule added in an update (a balance
        // transfer with only one side in the feed) applies to rows already received.
        const { refreshTransfers } = await import("./server/bank/sync");
        await refreshTransfers(new Date(Date.now() - 120 * 86_400_000));
        const { runDataFixes } = await import("./server/data-fixes");
        await runDataFixes();
        const { applyCategories } = await import("./server/categorize");
        await applyCategories();
        const { runBillAutomation } = await import("./server/bills-auto");
        await runBillAutomation();
      })
      .catch((error) => console.error("Accounts:", error instanceof Error ? error.message : error));
  }, 15_000).unref?.();
  // Checking's forecast and this month's net worth, saved every hour (the last run each day
  // stands), so forecasts can be checked against what happened and net worth has a trend.
  const snapshot = () =>
    void (async () => {
      const { recordForecast } = await import("./server/cash-cases");
      await recordForecast();
      const { getMonthPlan } = await import("./server/month-plan");
      const { getNetWorth } = await import("./server/net-worth");
      const plan = await getMonthPlan().catch(() => null);
      await getNetWorth(plan?.debt.cents ?? 0);
    })().catch((error) => console.error("Snapshots:", error instanceof Error ? error.message : error));
  setTimeout(snapshot, 90_000).unref?.();
  setInterval(snapshot, 60 * 60_000).unref?.();
  if (process.env.BANK_SYNC_SCHEDULER === "off") return;
  const { startBankScheduler } = await import("./server/bank/scheduler");
  startBankScheduler();
}
