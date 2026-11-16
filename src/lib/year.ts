/**
 * The year grid: every item by every month, budgeted beside paid.
 *
 * Pure, so the rules are tested without a database:
 *
 *  - A month an item is not scheduled in has no budget (null), which is
 *    different from a budget of zero.
 *  - A month override wins over the usual amount; a skipped month has none.
 *  - A retired (inactive) item only shows the months it was actually paid,
 *    so it does not haunt the future with budgets nobody owes.
 *  - The current month and later are marked future: until a month is over,
 *    an empty cell is a plan, not a miss.
 */

import { isDueInMonth, type LineItemForMonth } from "./month-model";
import type { Cents } from "./money";

export interface YearItem extends LineItemForMonth {
  plannedCents: Cents;
  categoryName: string | null;
  paidFromSurplus: boolean;
}

export interface YearCell {
  /** Null when the item is not due that month. */
  budgetedCents: Cents | null;
  actualCents: Cents | null;
  future: boolean;
  /** Paid more than budgeted. */
  over: boolean;
}

export interface YearRow {
  lineItemId: string;
  name: string;
  kind: LineItemForMonth["kind"];
  categoryName: string | null;
  paidFromSurplus: boolean;
  cells: YearCell[];
  budgetedCents: Cents;
  paidCents: Cents;
}

export interface YearMonthTotal {
  month: number;
  /** Bills only: income and items paid from what is left are excluded. */
  budgetedCents: Cents;
  paidCents: Cents;
  incomeCents: Cents;
  surplusPaidCents: Cents;
  future: boolean;
}

export interface YearGrid {
  year: number;
  rows: YearRow[];
  months: YearMonthTotal[];
  incomeReceivedCents: Cents;
  billsPaidCents: Cents;
  billsBudgetedCents: Cents;
  surplusPaidCents: Cents;
  leftOverCents: Cents;
  categories: Array<{ name: string; paidCents: Cents }>;
}

const key = (id: string, month: number) => `${id}:${month}`;

export function buildYearGrid(args: {
  year: number;
  items: YearItem[];
  /** Keyed `${lineItemId}:${month}` for this year. */
  plans: Map<string, { amountCents: Cents | null; skipped: boolean }>;
  actuals: Map<string, Cents>;
  /** The current year and month, to tell finished months from open ones. */
  now: { year: number; month: number };
  /** Paydays per month, for income tied to a payday. */
  paydaysIn?: (year: number, month: number) => Date[];
}): YearGrid {
  const { year, items, plans, actuals, now, paydaysIn } = args;
  const nowOrdinal = now.year * 12 + now.month;

  const rows: YearRow[] = [];

  for (const item of items) {
    const cells: YearCell[] = [];
    for (let month = 1; month <= 12; month++) {
      const actual = actuals.get(key(item.id, month)) ?? null;
      const scheduled = isDueInMonth({ ...item, active: true }, year, month, paydaysIn);
      const plan = plans.get(key(item.id, month));

      let budgeted: Cents | null = null;
      if (scheduled && (item.active || actual !== null)) {
        budgeted = plan?.skipped ? null : (plan?.amountCents ?? item.plannedCents);
      }
      // Paid in a month it was not scheduled: the payment still counts, against
      // a budget of zero.
      if (budgeted === null && actual !== null) budgeted = 0;

      cells.push({
        budgetedCents: budgeted,
        actualCents: actual,
        future: year * 12 + month >= nowOrdinal,
        over: actual !== null && budgeted !== null && actual > budgeted && item.kind !== "INCOME",
      });
    }

    if (cells.every((c) => c.budgetedCents === null && c.actualCents === null)) continue;

    rows.push({
      lineItemId: item.id,
      name: item.name,
      kind: item.kind,
      categoryName: item.categoryName,
      paidFromSurplus: item.paidFromSurplus,
      cells,
      budgetedCents: cells.reduce((s, c) => s + (c.budgetedCents ?? 0), 0),
      paidCents: cells.reduce((s, c) => s + (c.actualCents ?? 0), 0),
    });
  }

  const order = (r: YearRow) => (r.kind === "INCOME" ? 0 : r.paidFromSurplus ? 2 : 1);
  rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));

  const isBill = (r: YearRow) => r.kind !== "INCOME" && !r.paidFromSurplus;

  const months: YearMonthTotal[] = [];
  for (let m = 0; m < 12; m++) {
    months.push({
      month: m + 1,
      budgetedCents: rows.filter(isBill).reduce((s, r) => s + (r.cells[m].budgetedCents ?? 0), 0),
      paidCents: rows.filter(isBill).reduce((s, r) => s + (r.cells[m].actualCents ?? 0), 0),
      incomeCents: rows
        .filter((r) => r.kind === "INCOME")
        .reduce((s, r) => s + (r.cells[m].actualCents ?? 0), 0),
      surplusPaidCents: rows
        .filter((r) => r.paidFromSurplus && r.kind !== "INCOME")
        .reduce((s, r) => s + (r.cells[m].actualCents ?? 0), 0),
      future: year * 12 + m + 1 >= nowOrdinal,
    });
  }

  const incomeReceivedCents = months.reduce((s, m) => s + m.incomeCents, 0);
  const billsPaidCents = months.reduce((s, m) => s + m.paidCents, 0);
  const surplusPaidCents = months.reduce((s, m) => s + m.surplusPaidCents, 0);

  const byCategory = new Map<string, Cents>();
  for (const row of rows) {
    if (row.kind === "INCOME" || row.paidCents === 0) continue;
    const name = row.categoryName ?? "Uncategorised";
    byCategory.set(name, (byCategory.get(name) ?? 0) + row.paidCents);
  }

  return {
    year,
    rows,
    months,
    incomeReceivedCents,
    billsPaidCents,
    billsBudgetedCents: months.reduce((s, m) => s + m.budgetedCents, 0),
    surplusPaidCents,
    leftOverCents: incomeReceivedCents - billsPaidCents - surplusPaidCents,
    categories: [...byCategory]
      .map(([name, paidCents]) => ({ name, paidCents }))
      .sort((a, b) => b.paidCents - a.paidCents),
  };
}

/** CSV of the grid: one row per item, budgeted and paid per month. */
export function yearGridCsv(grid: YearGrid): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const money = (c: Cents | null) => (c === null ? "" : (c / 100).toFixed(2));
  const quote = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  // A leading = + - @ would be read as a formula by a spreadsheet.
  const text = (s: string) => quote(/^[=+\-@]/.test(s) ? `'${s}` : s);

  const header = [
    "Item",
    "Kind",
    "Category",
    ...months.flatMap((m) => [`${m} budget`, `${m} paid`]),
    "Total budget",
    "Total paid",
  ];

  const lines = [header.join(",")];
  for (const row of grid.rows) {
    lines.push(
      [
        text(row.name),
        row.kind === "INCOME" ? "Income" : row.paidFromSurplus ? "From what's left" : "Bill",
        text(row.categoryName ?? ""),
        ...row.cells.flatMap((c) => [money(c.budgetedCents), money(c.actualCents)]),
        money(row.budgetedCents),
        money(row.paidCents),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
