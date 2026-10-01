import Link from "next/link";
import { notFound } from "next/navigation";
import { getLineItem } from "@/server/line-items";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { listPaySchedules } from "@/server/pay-schedule";
import { NotFoundError } from "@/server/errors";
import { PageHeading } from "@/components/ui";
import { LineItemForm } from "../form";
import { updateLineItemAction } from "../actions";
import { toDecimalString } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function EditLineItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let item;
  try {
    item = await getLineItem(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [accounts, categories, paySchedules] = await Promise.all([
    listAccounts({ includeInactive: true }),
    listCategories({ includeInactive: true }),
    listPaySchedules(),
  ]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <Link href="/line-items" className="text-sm text-muted hover:text-foreground">
        Line items
      </Link>

      <div className="mt-4">
        <PageHeading title={item.name} />
      </div>

      <LineItemForm
        action={updateLineItemAction}
        submitLabel="Save changes"
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        cards={accounts.filter((a) => a.kind === "CREDIT_CARD").map((a) => ({ id: a.id, name: a.name }))}
        paySchedules={paySchedules.map((p) => ({ id: p.id, name: p.name }))}
        defaults={{
          id: item.id,
          name: item.name,
          kind: item.kind,
          categoryId: item.categoryId,
          paidFromId: item.paidFromId,
          chargedToId: item.chargedToId,
          payScheduleId: item.payScheduleId,
          plannedAmount: toDecimalString(item.plannedAmountCents),
          dueDay: item.dueDay,
          paidFromSurplus: item.paidFromSurplus,
          periodAssignment: item.periodAssignment,
          scheduleKind: item.scheduleKind,
          anchorMonth: item.months[0] ?? 1,
          months: item.months,
          onlyYear: item.onlyYear,
          startYear: item.startYear,
          startMonth: item.startMonth,
          endYear: item.endYear,
          endMonth: item.endMonth,
          paymentUrl: item.paymentUrl ?? "",
          notes: item.notes ?? "",
          active: item.active,
        }}
      />
    </div>
  );
}
