import Link from "next/link";
import { listLineItems } from "@/server/line-items";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { formatCents } from "@/lib/money";
import { getSettings } from "@/server/settings";
import { halfFor } from "@/lib/month-model";
import { Button, EmptyState, PageHeading } from "@/components/ui";
import { DeleteLineItem } from "./row";
import { versionLabel } from "@/lib/version";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  BILL: "Bills",
  SETTLEMENT: "Card settlements",
  INCOME: "Income",
};

const SCHEDULE_LABELS: Record<string, string> = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  SEMI_ANNUAL: "twice a year",
  ANNUAL: "yearly",
  CUSTOM: "some months",
  ONE_OFF: "one-off",
};

export default async function LineItemsPage() {
  const [items, accounts, categories, settings] = await Promise.all([
    listLineItems({ includeInactive: true }),
    listAccounts({ includeInactive: true }),
    listCategories({ includeInactive: true }),
    getSettings(),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const groups = (["BILL", "SETTLEMENT", "INCOME"] as const)
    .map((kind) => ({ kind, items: items.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        Budget
      </Link>

      <div className="mt-4">
        <PageHeading
          title="Line items"
          description="The recurring things that make up a month. The planned amount is the usual figure; a single month that differs is edited on the month view."
          action={
            <Link href="/line-items/new">
              <Button>Add</Button>
            </Link>
          }
        />
      </div>

      {items.length === 0 ? (
        <EmptyState>
          Nothing added yet. Start with the bills you pay every month — the
          irregular ones are easier once the shape is familiar.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.kind}>
              <h2 className="mb-2 text-sm font-medium text-muted">
                {KIND_LABELS[group.kind]}
              </h2>
              <div className="overflow-hidden rounded-lg border border-line">
                {group.items.map((item, index) => {
                  const half = halfFor(item.dueDay, item.periodAssignment, settings.splitDay);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-4 bg-surface px-4 py-3 ${
                        index > 0 ? "border-t border-line" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/line-items/${item.id}`}
                          className={`font-medium hover:underline ${
                            item.active ? "" : "text-muted line-through"
                          }`}
                        >
                          {item.name}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {[
                            item.categoryId ? categoryName.get(item.categoryId) : null,
                            item.paidFromId ? accountName.get(item.paidFromId) : null,
                            SCHEDULE_LABELS[item.scheduleKind],
                            item.dueDay ? `day ${item.dueDay}` : null,
                            item.paidFromSurplus
                              ? "paid from what's left"
                              : half === 0
                                ? "first half"
                                : "second half",
                            item.active ? null : "inactive",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      <span className="tnum shrink-0 text-sm">
                        {formatCents(item.plannedAmountCents)}
                      </span>

                      <DeleteLineItem id={item.id} name={item.name} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-12 text-xs text-muted">{versionLabel()}</footer>
    </div>
  );
}
