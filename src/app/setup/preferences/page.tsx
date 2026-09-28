import { listAccounts } from "@/server/accounts";
import { getSettings } from "@/server/settings";
import { PageHeading } from "@/components/ui";
import { PreferencesForm } from "./form";
import { toDecimalString } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const [accounts, settings] = await Promise.all([listAccounts(), getSettings()]);
  const bankAccounts = accounts.filter((a) => a.kind === "BANK");

  return (
    <div>
      <PageHeading
        title="Preferences"
        description="How the month is divided and how far ahead the projection looks."
      />

      {bankAccounts.length === 0 ? (
        <p className="text-sm text-danger">
          Add a bank account first — the bills account has to be one.
        </p>
      ) : (
        <PreferencesForm
          bankAccounts={bankAccounts.map((a) => ({ id: a.id, name: a.name }))}
          settings={{
            splitDay: settings.splitDay,
            horizonDays: settings.horizonDays,
            buffer: toDecimalString(settings.bufferCents),
            carryMonths: settings.carryMonths,
            billsAccountId: settings.billsAccountId,
          }}
        />
      )}
    </div>
  );
}
