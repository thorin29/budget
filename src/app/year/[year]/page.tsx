import Link from "next/link";
import { notFound } from "next/navigation";
import { getYearView } from "@/server/year";
import { formatCents } from "@/lib/money";
import type { YearCell, YearRow } from "@/lib/year";
import { EmptyState, PageHeading, StatCard, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Whole dollars for dense tables and chart labels. */
const whole = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  );

function Cell({ cell }: { cell: YearCell }) {
  if (cell.actualCents !== null) {
    return (
      <span className={cell.over ? "font-semibold text-over" : ""} title={cell.over && cell.budgetedCents !== null ? `Budget ${formatCents(cell.budgetedCents)}` : undefined}>
        {whole(cell.actualCents)}
      </span>
    );
  }
  if (cell.budgetedCents === null) return <span className="text-line-strong">·</span>;
  if (cell.future) return <span className="italic text-subtle">{whole(cell.budgetedCents)}</span>;
  return <span className="text-subtle" title="Nothing recorded">—</span>;
}

function GroupRows({ title, rows }: { title: string; rows: YearRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <tr>
        <th
          colSpan={14}
          scope="colgroup"
          className="sticky left-0 bg-sunken px-4 py-2 text-left font-sans text-xs font-semibold uppercase tracking-wide text-neutral"
        >
          {title}
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.lineItemId} className="border-t border-line">
          <th scope="row" className="sticky left-0 max-w-48 truncate bg-surface px-4 py-2 text-left font-sans text-sm font-medium">
            {row.name}
          </th>
          {row.cells.map((cell, i) => (
            <td key={i} className="px-2.5 py-2 text-right">
              <Cell cell={cell} />
            </td>
          ))}
          <td className="px-4 py-2 text-right font-semibold">{whole(row.paidCents)}</td>
        </tr>
      ))}
    </>
  );
}

export default async function YearPage({ params }: { params: Promise<{ year: string }> }) {
  const raw = await params;
  const year = Number(raw.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2999) notFound();

  const view = await getYearView(year);

  const income = view.rows.filter((r) => r.kind === "INCOME");
  const bills = view.rows.filter((r) => r.kind !== "INCOME" && !r.paidFromSurplus);
  const surplus = view.rows.filter((r) => r.kind !== "INCOME" && r.paidFromSurplus);

  const barMax = Math.max(1, ...view.months.map((m) => Math.max(m.budgetedCents, m.paidCents)));
  const catMax = Math.max(1, ...view.categories.map((c) => c.paidCents));

  const change =
    view.previousBillsPaidCents && view.previousBillsPaidCents > 0
      ? (view.billsPaidCents - view.previousBillsPaidCents) / view.previousBillsPaidCents
      : null;

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeading
        title="Year & reports"
        description="Every bill by every month — what was planned beside what was paid."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex rounded-xl border border-line bg-surface p-1 text-sm shadow-card" aria-label="Year">
              {view.years.slice(0, 6).map((y) => (
                <Link
                  key={y}
                  href={`/year/${y}`}
                  aria-current={y === year ? "page" : undefined}
                  className={`tnum rounded-lg px-3 py-1.5 font-medium transition ${
                    y === year ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-neutral-soft hover:text-foreground"
                  }`}
                >
                  {y}
                </Link>
              ))}
            </nav>
            <a href={`/year/${year}/csv`} className={buttonClass("quiet")}>
              Download CSV
            </a>
          </div>
        }
      />

      {view.rows.length === 0 ? (
        <EmptyState>
          Nothing planned or recorded in {year}. Import an old workbook under{" "}
          <Link href="/settings/data" className="font-semibold text-accent-text hover:underline">
            Settings → Import &amp; export
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Income received" value={formatCents(view.incomeReceivedCents)} />
            <StatCard
              label="Bills paid"
              value={formatCents(view.billsPaidCents)}
              detail={`of ${formatCents(view.billsBudgetedCents)} budgeted`}
            />
            <StatCard
              label="Paid from what's left"
              value={formatCents(view.surplusPaidCents)}
              detail={surplus.length ? surplus.map((r) => r.name).join(", ") : "nothing flagged"}
            />
            <StatCard
              label="Left over"
              value={formatCents(view.leftOverCents)}
              tone={view.leftOverCents < 0 ? "danger" : "default"}
              detail="income less everything paid"
            />
            <StatCard
              tone="hero"
              label="Bills against last year"
              value={change === null ? "—" : `${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`}
              detail={
                view.previousBillsPaidCents === null
                  ? `nothing recorded in ${year - 1}`
                  : `${formatCents(view.previousBillsPaidCents)} in ${year - 1}`
              }
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold">Bills by month</h2>
                <p className="flex gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-line-strong" /> budgeted
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> paid
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-over" /> over budget
                  </span>
                </p>
              </div>
              <div className="mt-5 flex h-44 items-end gap-1.5 sm:gap-2.5">
                {view.months.map((m) => (
                  <div key={m.month} className="flex h-full flex-1 flex-col justify-end">
                    <div
                      className="flex flex-1 items-end justify-center gap-0.5"
                      title={`${MONTHS[m.month - 1]}: ${formatCents(m.paidCents)} paid of ${formatCents(m.budgetedCents)}`}
                    >
                      <div
                        className={`w-1/2 max-w-3 rounded-t-sm ${m.future ? "bg-line" : "bg-line-strong"}`}
                        style={{ height: `${(m.budgetedCents / barMax) * 100}%` }}
                      />
                      <div
                        className={`w-1/2 max-w-3 rounded-t-sm ${m.paidCents > m.budgetedCents ? "bg-over" : "bg-accent"}`}
                        style={{ height: `${(m.paidCents / barMax) * 100}%` }}
                      />
                    </div>
                    <span className={`mt-1.5 text-center text-[11px] ${m.future ? "text-subtle" : "text-muted"}`}>
                      {MONTHS[m.month - 1]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h2 className="text-base font-bold">By category</h2>
              {view.categories.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Nothing paid yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {view.categories.slice(0, 8).map((c) => (
                    <li key={c.name}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="truncate">{c.name}</span>
                        <span className="tnum shrink-0 font-semibold">{formatCents(c.paidCents)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-soft">
                        <div className="h-full rounded-full bg-info" style={{ width: `${(c.paidCents / catMax) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
              <h2 className="text-base font-bold">Every item, every month</h2>
              <p className="text-xs text-muted">
                <span className="font-semibold text-over">Orange</span> is over budget ·{" "}
                <span className="italic">italic</span> is still a plan · — nothing recorded
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="tnum w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th scope="col" className="sticky left-0 bg-surface px-4 py-2.5 text-left font-sans font-semibold">
                      Item
                    </th>
                    {MONTHS.map((m, i) => (
                      <th
                        key={m}
                        scope="col"
                        className={`px-2.5 py-2.5 text-right font-sans font-semibold ${view.months[i].future ? "text-subtle" : ""}`}
                      >
                        {m}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-2.5 text-right font-sans font-semibold">
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <GroupRows title="Income" rows={income} />
                  <GroupRows title="Bills" rows={bills} />
                  <GroupRows title="Paid from what's left" rows={surplus} />
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line-strong font-semibold">
                    <th scope="row" className="sticky left-0 bg-surface px-4 py-2.5 text-left font-sans">
                      Bills paid
                    </th>
                    {view.months.map((m) => (
                      <td
                        key={m.month}
                        className={`px-2.5 py-2.5 text-right ${m.paidCents > m.budgetedCents ? "text-over" : ""}`}
                      >
                        {m.paidCents ? whole(m.paidCents) : <span className="text-subtle">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right">{whole(view.billsPaidCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
