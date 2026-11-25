import { requireDevice } from "@/server/device-auth";
import { listBankTransactions } from "@/server/bank/accounts";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Recent transactions, newest first. `?filter=all|none|pending|in`, `?q=` to search merchants,
 * `?month=YYYY-MM` (this month and last by default). A charge split by item lists its parts.
 */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const q = new URL(request.url).searchParams;
    const filter = q.get("filter") ?? "all";
    const m = /^(\d{4})-(\d{2})$/.exec(q.get("month") ?? "");
    const now = new Date();
    const from = m ? `${m[1]}-${m[2]}-01` : new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)).toISOString().slice(0, 10);
    const to = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10) : undefined;
    const rows = await listBankTransactions({ query: q.get("q") ?? undefined, category: filter === "none" ? "none" : undefined, take: 400, from, to });
    const kept = rows.filter((r) => (filter === "pending" ? r.pending : filter === "in" ? r.amountCents > 0 && r.kind === "NORMAL" : true));
    return ok({
      transactions: kept.map((r) => ({
        id: r.id,
        postedOn: r.postedOn.toISOString().slice(0, 10),
        merchant: r.merchant,
        account: r.accountName,
        amountCents: r.amountCents,
        pending: r.pending,
        kind: r.kind,
        categoryId: r.categoryId,
        // Ledger's own categories aren't flagged as guesses (older phone apps still read this).
        guessed: false,
        peer: r.peer,
        splits: r.splits.map((p) => ({ categoryId: p.categoryId, categoryName: p.categoryName, amountCents: p.amountCents, note: p.note })),
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
