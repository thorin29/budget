import Link from "next/link";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { PageHeading } from "@/components/ui";
import { LineItemForm } from "../form";
import { createLineItemAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewLineItemPage() {
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <Link href="/line-items" className="text-sm text-muted hover:text-foreground">
        Line items
      </Link>

      <div className="mt-4">
        <PageHeading title="New line item" />
      </div>

      <LineItemForm
        action={createLineItemAction}
        submitLabel="Add line item"
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        cards={accounts.filter((a) => a.kind === "CREDIT_CARD").map((a) => ({ id: a.id, name: a.name }))}
        defaults={{
          name: "",
          kind: "BILL",
          categoryId: null,
          paidFromId: null,
          chargedToId: null,
          plannedAmount: "",
          dueDay: null,
          periodAssignment: "AUTO",
          scheduleKind: "MONTHLY",
          anchorMonth: 1,
          months: [],
          onlyYear: null,
          startYear: null,
          startMonth: null,
          endYear: null,
          endMonth: null,
          paymentUrl: "",
          notes: "",
          active: true,
        }}
      />
    </div>
  );
}
