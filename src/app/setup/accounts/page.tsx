import { listAccounts, ACCOUNT_KINDS } from "@/server/accounts";
import { PageHeading } from "@/components/ui";
import { AccountsForm, AccountRow } from "./form";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  BANK: "Bank account",
  CREDIT_CARD: "Credit card",
  CASH: "Cash",
  OTHER: "Other",
};

export default async function AccountsPage() {
  const accounts = await listAccounts({ includeInactive: true });
  const bankAccounts = accounts.filter((a) => a.kind === "BANK");

  return (
    <div>
      <PageHeading
        title="Accounts"
        description="Every place money leaves from or lands on. A credit card can name the account that pays it off, which is used for reporting only."
      />

      <AccountsForm
        kinds={ACCOUNT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
        bankAccounts={bankAccounts.map((a) => ({ id: a.id, name: a.name }))}
      />

      <div className="mt-8 space-y-2">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">Nothing added yet.</p>
        ) : (
          accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              kindLabel={KIND_LABELS[account.kind]}
              settledByName={
                accounts.find((a) => a.id === account.settledById)?.name ?? null
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
