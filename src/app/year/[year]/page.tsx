/**
 * Year plan: every item by every month, planned beside paid, in the same parts as the other tabs:
 * income, bills, the debt payment, card payments, and anything paid from what's left. Each cell is
 * tinted by what happened (paid, over plan, not paid, still planned), each row has a small trend,
 * and a side panel sums up the year so far.
 */

import { InsightsTabs } from "@/components/insights-tabs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getYearView, type YearSection } from "@/server/year";
import type { YearCell, YearRow } from "@/lib/year";
import { Card, EmptyState, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const whole = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;

type State = "paid" | "over" | "missed" | "planned" | "none";
function stateOf(c: YearCell): State {
  if (c.actualCents !== null) return c.over ? "over" : "paid";
  if (c.budgetedCents === null) return "none";
  return c.future ? "planned" : "missed";
}
const TINT: Record<State, string> = {
  paid: "bg-ok-soft",
  over: "bg-warn-soft",
  missed: "bg-danger-soft",
  planned: "",
  none: "",
};
const BAR: Record<State, string> = {
  paid: "var(--series-1)",
  over: "var(--warn)",
  missed: "var(--danger)",
  planned: "var(--border-strong)",
  none: "transparent",
};

const SECTIONS: Array<[YearSection, string]> = [
  ["income", "Income"],
  ["bills", "Bills"],
  ["debt", "Debt payment"],
  ["cards", "Card payments"],
  ["surplus", "Paid from what's left"],
];

/** What a cell counts as: paid if paid, otherwise the plan. */
const amount = (c: YearCell) => c.actualCents ?? c.budgetedCents ?? 0;

function Trend({ cells }: { cells: YearCell[] }) {
  const max = Math.max(1, ...cells.map(amount));
  return (
    <span className="flex h-[18px] items-end gap-[2px]" aria-hidden>
      {cells.map((c, i) => (
        <span key={i} className="w-[4px] rounded-[1px]" style={{ height: `${Math.max(c.budgetedCents === null && c.actualCents === null ? 0 : 2, (amount(c) / max) * 18)}px`, background: BAR[stateOf(c)] }} />
      ))}
    </span>
  );
}

function CellText({ c }: { c: YearCell }) {
  const s = stateOf(c);
  if (s === "none") return <span className="text-line-strong">·</span>;
  if (s === "planned") return <span className="italic text-subtle">{whole(c.budgetedCents!)}</span>;
  if (s === "missed") return <span className="font-bold text-danger" title="Not paid">{whole(c.budgetedCents!)} !</span>;
  return (
    <span className={s === "over" ? "font-semibold text-warn" : ""} title={s === "over" && c.budgetedCents !== null ? `Planned ${whole(c.budgetedCents)}` : undefined}>
      {whole(c.actualCents!)}
    </span>
  );
}

export default async function YearPage({ params }: { params: Promise<{ year: string }> }) {
  const raw = await params;
  const year = Number(raw.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2999) notFound();
  const view = await getYearView(year);
  const now = new Date();
  const nowMonth = year === now.getFullYear() ? now.getMonth() : year < now.getFullYear() ? 12 : -1; // index of the current month

  const parts = SECTIONS.map(([key, title]) => ({ key, title, rows: view.rows.filter((r) => (view.sectionOf[r.lineItemId] ?? "bills") === key) })).filter((p) => p.rows.length);
  const rowsOf = (key: YearSection) => parts.find((p) => p.key === key)?.rows ?? [];
  const paid = (rows: YearRow[]) => rows.reduce((t, r) => t + r.paidCents, 0);
  const planned = (rows: YearRow[]) => rows.reduce((t, r) => t + r.budgetedCents, 0);
  const monthTotal = (rows: YearRow[], i: number) => rows.reduce((t, r) => t + amount(r.cells[i]), 0);

  const income = paid(rowsOf("income"));
  const bills = paid(rowsOf("bills"));
  const debt = paid(rowsOf("debt"));
  const net = income - bills - debt;
  // Bills paid in the months that are over, against the same months a year before.
  const closed = Math.min(12, Math.max(0, nowMonth));
  const thisSame = rowsOf("bills").reduce((t, r) => t + r.cells.slice(0, closed).reduce((s, c) => s + (c.actualCents ?? 0), 0), 0);
  const lastSame = view.previousBillsByMonth.slice(0, closed).reduce((a, b) => a + b, 0);
  // Categories of bills only (not income, card payments or the debt payment).
  const billCats = new Map<string, number>();
  for (const r of rowsOf("bills")) billCats.set(r.categoryName ?? "Other", (billCats.get(r.categoryName ?? "Other") ?? 0) + r.paidCents);
  const cats = [...billCats].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const cmax = Math.max(1, ...cats.map(([, c]) => c));

  return (
    <div className="space-y-4">
      <InsightsTabs
        active="year"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex gap-0.5 rounded-xl border border-line bg-surface p-1 text-sm font-semibold" aria-label="Year">
              {view.years
                .slice(0, 6)
                .reverse()
                .map((y) => (
                  <Link key={y} href={`/year/${y}`} aria-current={y === year ? "page" : undefined} className={`tnum rounded-lg px-3 py-1 ${y === year ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
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
      <h1 className="sr-only">Year plan {year}</h1>

      {view.rows.length === 0 ? (
        <EmptyState>
          Nothing planned or recorded in {year}. Import an old workbook under{" "}
          <Link href="/settings/data" className="font-semibold text-accent-text hover:underline">
            Settings → Import &amp; export
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_18rem]">
          <Card className="!px-4 !py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">Every item, every month</h2>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                {(
                  [
                    ["bg-ok-soft", "Paid"],
                    ["bg-warn-soft", "Over plan"],
                    ["bg-danger-soft", "Not paid"],
                    ["bg-surface ring-1 ring-line", "Planned"],
                  ] as const
                ).map(([cls, label]) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="tnum w-full min-w-[900px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-xs text-muted">
                    <th scope="col" className="sticky left-0 bg-surface px-2 py-2 text-left font-semibold">
                      Item
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-semibold">
                      Trend
                    </th>
                    {MONTHS.map((m, i) => (
                      <th key={m} scope="col" className={`px-1.5 py-2 text-right font-semibold ${i === nowMonth ? "rounded-t-md bg-accent-soft text-accent-text" : ""}`}>
                        {m}
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-2 text-right font-semibold">
                      Paid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => (
                    <SectionRows key={p.key} title={p.title} rows={p.rows} nowMonth={nowMonth} monthTotal={(i) => monthTotal(p.rows, i)} paid={paid(p.rows)} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line-strong font-bold">
                    <th scope="row" className="sticky left-0 bg-surface px-2 py-2 text-left">
                      Income − bills &amp; debt
                    </th>
                    <td />
                    {MONTHS.map((m, i) => {
                      const v = monthTotal(rowsOf("income"), i) - monthTotal(rowsOf("bills"), i) - monthTotal(rowsOf("debt"), i);
                      return (
                        <td key={m} className={`px-1.5 py-2 text-right ${v < 0 ? "text-danger" : "text-ok"} ${i >= nowMonth ? "font-semibold opacity-70" : ""}`}>
                          {whole(v)}
                        </td>
                      );
                    })}
                    <td className={`px-2 py-2 text-right ${net < 0 ? "text-danger" : "text-ok"}`}>{whole(net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Months still to come show the plan. The bottom row counts paid amounts, or the plan where nothing is paid yet.</p>
          </Card>

          <Card className="grid gap-x-8 gap-y-3 sm:grid-cols-3 2xl:block 2xl:space-y-3">
            <div>
              <h2 className="text-base font-bold">{year === now.getFullYear() ? `${year} so far` : year}</h2>
              <dl className="mt-1 divide-y divide-line text-sm">
                {(
                  [
                    ["Income received", income, ""],
                    ["Bills paid", bills, `of ${whole(planned(rowsOf("bills")))} planned`],
                    ...(rowsOf("debt").length ? ([["Debt payments", debt, ""]] as Array<[string, number, string]>) : []),
                    ["Income − bills & debt", net, ""],
                  ] as Array<[string, number, string]>
                ).map(([label, cents, sub]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="text-muted">
                      {label}
                      {sub ? <span className="block text-xs">{sub}</span> : null}
                    </dt>
                    <dd className={`font-bold ${label.startsWith("Income −") ? (cents < 0 ? "text-danger" : "text-ok") : ""}`}>{whole(cents)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {cats.length ? (
              <div>
                <h3 className="text-sm font-bold">Bills by category</h3>
                <ul className="mt-1.5 space-y-2">
                  {cats.map(([name, cents]) => (
                    <li key={name} className="text-sm">
                      <span className="flex justify-between gap-3">
                        <span className="truncate">{name}</span>
                        <span className="tnum">{whole(cents)}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-full bg-neutral-soft">
                        <span className="block h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(cents / cmax) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {closed > 0 && lastSame > 0 ? (
              <p className="text-xs text-muted">
                vs {year - 1}, {MONTHS[0]}–{MONTHS[closed - 1]}: bills {thisSame >= lastSame ? "up" : "down"} {whole(Math.abs(thisSame - lastSame))} ({Math.round((Math.abs(thisSame - lastSame) / lastSame) * 100)}%)
              </p>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}

function SectionRows({ title, rows, nowMonth, monthTotal, paid }: { title: string; rows: YearRow[]; nowMonth: number; monthTotal: (i: number) => number; paid: number }) {
  return (
    <>
      <tr className="bg-neutral-soft">
        <th scope="colgroup" className="sticky left-0 bg-neutral-soft px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-muted">
          {title}
        </th>
        <td />
        {MONTHS.map((m, i) => (
          <td key={m} className={`px-1.5 py-1.5 text-right font-bold ${i === nowMonth ? "bg-accent-soft" : ""}`}>
            {whole(monthTotal(i))}
          </td>
        ))}
        <td className="px-2 py-1.5 text-right font-bold">{whole(paid)}</td>
      </tr>
      {rows.map((row) => (
        <tr key={row.lineItemId} className="border-t border-line">
          <th scope="row" className="sticky left-0 max-w-44 truncate bg-surface px-2 py-1.5 pl-4 text-left font-medium">
            {row.name}
          </th>
          <td className="px-2 py-1.5">
            <Trend cells={row.cells} />
          </td>
          {row.cells.map((cell, i) => (
            <td key={i} className={`px-1.5 py-1.5 text-right ${TINT[stateOf(cell)]} ${i === nowMonth ? "outline outline-1 -outline-offset-1 outline-accent/40" : ""}`}>
              <CellText c={cell} />
            </td>
          ))}
          <td className="px-2 py-1.5 text-right font-semibold">{whole(row.paidCents)}</td>
        </tr>
      ))}
    </>
  );
}
