import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { toCents, toDecimalString } from "@/lib/money";
import { toCsv } from "@/lib/bank-csv";

export const dynamic = "force-dynamic";

const USE_LABELS: Record<string, string> = { SPENDING: "Spending", BALANCE_ONLY: "Balance only", HIDDEN: "Hidden" };

/**
 * Bank-feed data as CSV, for your own analysis or backup:
 *   ?what=transactions (default) — every transaction, oldest first
 *   ?what=accounts — every account with its balance and choice
 * The file comes from your server to your browser; nothing else sees it.
 */
export async function GET(request: Request) {
  // The proxy already requires sign-in here; checking again keeps one gap from opening it.
  try {
    await requireUser();
  } catch {
    return new Response("Sign in required", { status: 401 });
  }
  const what = new URL(request.url).searchParams.get("what") === "accounts" ? "accounts" : "transactions";
  const stamp = new Date().toISOString().slice(0, 10);
  let body: string;

  if (what === "accounts") {
    const accounts = (await prisma.bankAccount.findMany({
      include: { linkedAccount: { select: { name: true } }, _count: { select: { transactions: true } } },
    })) as Array<{
      id: string;
      institution: string | null;
      name: string;
      currency: string;
      balance: { toString(): string } | null;
      availableBalance: { toString(): string } | null;
      balanceDate: Date | null;
      use: string | null;
      linkedAccount: { name: string } | null;
      lastSeenAt: Date;
      _count: { transactions: number };
    }>;
    accounts.sort((a, b) => (a.institution ?? "~").localeCompare(b.institution ?? "~") || a.name.localeCompare(b.name));
    body = toCsv(
      ["Account ID", "Institution", "Account", "Currency", "Balance", "Available", "Balance date", "Use", "Keeps current", "Transactions", "Last seen"],
      accounts.map((a) => [
        a.id,
        a.institution,
        a.name,
        a.currency,
        a.balance === null ? null : toDecimalString(toCents(a.balance)),
        a.availableBalance === null ? null : toDecimalString(toCents(a.availableBalance)),
        a.balanceDate?.toISOString().slice(0, 10),
        a.use ? USE_LABELS[a.use] : "Not chosen",
        a.linkedAccount?.name,
        a._count.transactions,
        a.lastSeenAt.toISOString(),
      ]),
    );
  } else {
    const rows = (await prisma.bankTransaction.findMany({
      orderBy: [{ postedOn: "asc" }, { createdAt: "asc" }],
      include: { account: { select: { id: true, name: true, institution: true, use: true } } },
    })) as Array<{
      id: string;
      postedOn: Date;
      amount: { toString(): string };
      description: string;
      payee: string | null;
      memo: string | null;
      merchant: string;
      pending: boolean;
      kind: string;
      transferOfId: string | null;
      source: string;
      account: { id: string; name: string; institution: string | null; use: string | null };
    }>;
    body = toCsv(
      ["Date", "Institution", "Account", "Account ID", "Use", "Merchant", "Description", "Payee", "Memo", "Amount", "Kind", "Pending", "Source", "Transaction ID", "Transfer of"],
      rows.map((r) => [
        r.postedOn.toISOString().slice(0, 10),
        r.account.institution,
        r.account.name,
        r.account.id,
        r.account.use ? USE_LABELS[r.account.use] : "Not chosen",
        r.merchant,
        r.description,
        r.payee,
        r.memo,
        toDecimalString(toCents(r.amount)),
        r.kind.toLowerCase(),
        r.pending,
        r.source,
        r.id,
        r.transferOfId,
      ]),
    );
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bank-${what}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
