import Link from "next/link";
import { notFound } from "next/navigation";
import { getMonthView } from "@/server/month";
import { formatCents, toDecimalString } from "@/lib/money";
import { versionLabel } from "@/lib/version";
import { Card, EmptyState } from "@/components/ui";
import { BalanceForm, EntryRow } from "../../rows";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function shift(year: number, month: number, by: number) {
  const ordinal = year * 12 + (month - 1) + by;
  return { year: Math.floor(ordinal / 12), month: (ordinal % 12) + 1 };
}

export default async function MonthPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  const raw = await params;
  const year = Number(raw.year);
  const month = Number(raw.month);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    notFound();
  }

  const view = await getMonthView(year, month);
  const previous = shift(year, month, -1);
  const next = shift(year, month, 1);

  const hasItems = view.halves[0].entries.length + view.halves[1].entries.length > 0;

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          Budget
        </Link>
        <Link href="/line-items" className="text-sm text-muted hover:text-foreground">
          Line items
        </Link>
      </div>

      <header className="mt-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">
          {MONTH_NAMES[month - 1]} {year}
        </h1>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href={`/month/${previous.year}/${previous.month}`}
            className="rounded-md px-2.5 py-1.5 text-muted hover:bg-accent-soft hover:text-foreground"
          >
            ← {MONTH_NAMES[previous.month - 1].slice(0, 3)}
          </Link>
          <Link
            href={`/month/${next.year}/${next.month}`}
            className="rounded-md px-2.5 py-1.5 text-muted hover:bg-accent-soft hover:text-foreground"
          >
            {MONTH_NAMES[next.month - 1].slice(0, 3)} →
          </Link>
        </nav>
      </header>

      {!hasItems ? (
        <div className="mt-6">
          <EmptyState>
            Nothing due this month. Add line items and they will appear here.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <BalanceForm
                year={year}
                month={month}
                accountName={view.billsAccountName}
                defaultValue={
                  view.billsBalanceCents === null
                    ? ""
                    : toDecimalString(view.billsBalanceCents)
                }
              />
            </Card>

            <Card>
              <p className="text-xs text-muted">Free after the first half</p>
              <p className="tnum mt-1 text-xl font-semibold">
                {view.transferAfterFirstCents === null
                  ? "—"
                  : formatCents(view.transferAfterFirstCents)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {formatCents(view.halves[0].remainingCents)} still owed
              </p>
            </Card>

            <Card>
              <p className="text-xs text-muted">Free after both halves</p>
              <p className="tnum mt-1 text-xl font-semibold">
                {view.transferAfterSecondCents === null
                  ? "—"
                  : formatCents(view.transferAfterSecondCents)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {formatCents(view.totalRemainingCents)} still owed
              </p>
            </Card>
          </div>

          {view.carriedCount > 0 ? (
            <p className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {view.carriedCount} unpaid {view.carriedCount === 1 ? "bill" : "bills"} carried
              forward from earlier months.
            </p>
          ) : null}

          {view.halves.map((half) => (
            <section key={half.half.index} className="mt-8">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted">{half.half.label}</h2>
                <p className="tnum text-xs text-muted">
                  {formatCents(half.paidCents)} paid · {formatCents(half.remainingCents)}{" "}
                  remaining
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex gap-3 border-b border-line px-4 py-2 text-xs text-muted">
                  <span className="flex-1">Item</span>
                  <span className="w-24 text-right">Budget</span>
                  <span className="w-24 text-right">Actual</span>
                </div>

                {half.entries.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted">
                    Nothing in this half.
                  </p>
                ) : (
                  half.entries.map((entry) => (
                    <EntryRow
                      key={`${entry.lineItemId}-${entry.carriedFrom?.month ?? month}`}
                      year={year}
                      month={month}
                      lineItemId={entry.lineItemId}
                      name={entry.name}
                      categoryName={entry.categoryName}
                      accountName={entry.accountName}
                      paymentUrl={entry.paymentUrl}
                      dueDay={entry.dueDay}
                      budgetedCents={entry.budgetedCents}
                      plannedCents={entry.plannedCents}
                      actualCents={entry.actualCents}
                      adjusted={entry.adjusted}
                      carriedFrom={entry.carriedFrom}
                      budgetedDisplay={toDecimalString(entry.budgetedCents)}
                    />
                  ))
                )}
              </div>
            </section>
          ))}

          {view.income.length > 0 ? (
            <section className="mt-8">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted">Income</h2>
                <p className="tnum text-xs text-muted">
                  {formatCents(view.incomeReceivedCents)} received of{" "}
                  {formatCents(view.incomeExpectedCents)} expected
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                {view.income.map((entry) => (
                  <EntryRow
                    key={entry.lineItemId}
                    year={year}
                    month={month}
                    lineItemId={entry.lineItemId}
                    name={entry.name}
                    categoryName={entry.categoryName}
                    accountName={entry.accountName}
                    paymentUrl={entry.paymentUrl}
                    dueDay={entry.dueDay}
                    budgetedCents={entry.budgetedCents}
                    plannedCents={entry.plannedCents}
                    actualCents={entry.actualCents}
                    adjusted={entry.adjusted}
                    carriedFrom={null}
                    budgetedDisplay={toDecimalString(entry.budgetedCents)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="tnum mt-8 flex justify-between border-t border-line pt-4 text-sm">
            <span className="text-muted">Month total</span>
            <span>
              {formatCents(view.totalPaidCents)} paid of{" "}
              {formatCents(view.totalBudgetedCents)} budgeted
            </span>
          </div>
        </>
      )}

      <footer className="mt-12 text-xs text-muted">{versionLabel()}</footer>
    </div>
  );
}
