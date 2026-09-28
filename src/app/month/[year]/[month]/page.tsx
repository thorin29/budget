import Link from "next/link";
import { notFound } from "next/navigation";
import { getMonthView, type MonthEntry } from "@/server/month";
import { formatCents, toDecimalString } from "@/lib/money";
import { versionLabel } from "@/lib/version";
import { EmptyState } from "@/components/ui";
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

/** One row of the tables, wired to the month it belongs to. */
function row(entry: MonthEntry, year: number, month: number) {
  return (
    <EntryRow
      key={`${entry.lineItemId}-${entry.year}-${entry.month}`}
      year={entry.carriedFrom ? entry.year : year}
      month={entry.carriedFrom ? entry.month : month}
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
  );
}

function SectionHeader({ title, right }: { title: string; right: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line bg-background/40 px-4 py-2.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="tnum text-xs text-muted">{right}</p>
    </div>
  );
}

function ColumnLabels() {
  return (
    <div className="flex gap-3 border-b border-line px-4 py-1.5 text-[11px] uppercase tracking-wide text-muted">
      <span className="flex-1">Item</span>
      <span className="w-24 text-right">Budget</span>
      <span className="w-24 text-right">Actual</span>
    </div>
  );
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

  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  const hasItems =
    view.halves[0].entries.length + view.halves[1].entries.length + view.income.length > 0;

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          Budget
        </Link>
        <div className="flex gap-4">
          <Link href="/projection" className="text-sm text-muted hover:text-foreground">
            What can I pay?
          </Link>
          <Link href="/line-items" className="text-sm text-muted hover:text-foreground">
            Line items
          </Link>
        </div>
      </div>

      <header className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {MONTH_NAMES[month - 1]} {year}
        </h1>

        <nav className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
          <Link
            href={`/month/${previous.year}/${previous.month}`}
            className="rounded-md px-3 py-1.5 text-muted transition hover:bg-accent-soft hover:text-foreground"
          >
            ← {MONTH_NAMES[previous.month - 1].slice(0, 3)}
          </Link>
          <Link
            href="/month"
            aria-current={isCurrent ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 transition ${
              isCurrent
                ? "bg-accent-soft font-medium text-foreground"
                : "text-muted hover:bg-accent-soft hover:text-foreground"
            }`}
          >
            Today
          </Link>
          <Link
            href={`/month/${next.year}/${next.month}`}
            className="rounded-md px-3 py-1.5 text-muted transition hover:bg-accent-soft hover:text-foreground"
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
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* ---------------------------------------------- tables */}
          <div className="space-y-5">
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
              {view.income.length > 0 ? (
                <>
                  <SectionHeader
                    title="Income"
                    right={`${formatCents(view.incomeReceivedCents)} received of ${formatCents(
                      view.incomeExpectedCents,
                    )}`}
                  />
                  <ColumnLabels />
                  {view.income.map((entry) => row(entry, year, month))}
                </>
              ) : null}

              {view.halves.map((half) => (
                <div key={half.half.index}>
                  <SectionHeader
                    title={half.half.label}
                    right={`${formatCents(half.paidCents)} paid · ${formatCents(
                      half.remainingCents,
                    )} remaining`}
                  />
                  <ColumnLabels />
                  {half.entries.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted">
                      Nothing in this half.
                    </p>
                  ) : (
                    half.entries.map((entry) => row(entry, year, month))
                  )}
                </div>
              ))}

              <div className="tnum flex justify-between border-t-2 border-line px-4 py-3 text-sm font-medium">
                <span>Month total</span>
                <span>
                  {formatCents(view.totalPaidCents)} paid of{" "}
                  {formatCents(view.totalBudgetedCents)}
                </span>
              </div>
            </div>

            {view.carriedCount > 0 ? (
              <details className="overflow-hidden rounded-xl border border-danger/30 bg-danger/5">
                <summary className="cursor-pointer px-4 py-2.5 text-sm text-danger">
                  {view.carriedCount} unpaid{" "}
                  {view.carriedCount === 1 ? "bill" : "bills"} from earlier months,{" "}
                  {formatCents(view.carriedCents)} — counted in the first half
                </summary>

                <p className="border-t border-danger/20 px-4 py-2 text-xs text-muted">
                  Open a row to settle it. If it cost nothing that month, record
                  zero — or use &ldquo;nothing due this month&rdquo;, which removes it
                  from the month rather than recording a payment. Only the last{" "}
                  {view.carryMonths === 1
                    ? "month"
                    : `${view.carryMonths} months`}{" "}
                  are carried; older gaps are treated as paid, which is changed in{" "}
                  <Link href="/setup/preferences" className="text-accent hover:underline">
                    preferences
                  </Link>
                  .
                </p>

                <div className="border-t border-danger/20 bg-surface">
                  {view.carried.map((entry) => row(entry, year, month))}
                </div>
              </details>
            ) : null}
          </div>

          {/* ---------------------------------------------- summary */}
          <aside className="space-y-3 lg:sticky lg:top-8">
            {view.billsAccountId === null ? (
              <div className="rounded-xl border border-line bg-surface p-4 text-sm">
                <p className="font-medium">Pick a bills account</p>
                <p className="mt-1 text-muted">
                  The transfer figures start from one bank account&rsquo;s balance.
                  Choose it in{" "}
                  <Link href="/setup/preferences" className="text-accent hover:underline">
                    preferences
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
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
              </div>
            )}

            <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
              <p className="text-xs text-muted">Free after the first half</p>
              <p className="tnum mt-1 text-2xl font-semibold">
                {view.transferAfterFirstCents === null
                  ? "—"
                  : formatCents(view.transferAfterFirstCents)}
              </p>
              <p className="tnum mt-1 text-xs text-muted">
                {formatCents(view.halves[0].remainingCents + view.carriedCents)} still owed
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
              <p className="text-xs text-muted">Free after both halves</p>
              <p className="tnum mt-1 text-2xl font-semibold">
                {view.transferAfterSecondCents === null
                  ? "—"
                  : formatCents(view.transferAfterSecondCents)}
              </p>
              <p className="tnum mt-1 text-xs text-muted">
                {formatCents(view.totalRemainingCents)} still owed
              </p>
            </div>
          </aside>
        </div>
      )}

      <footer className="mt-12 text-xs text-muted">{versionLabel()}</footer>
    </div>
  );
}
