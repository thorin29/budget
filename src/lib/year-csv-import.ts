/**
 * A year plan as CSV (the Year Plan's own download, or the blank template, edited in Excel or
 * Sheets and saved as CSV) turned into the import document the importer reviews. Columns: Item,
 * Kind (Bill, Income or From what's left), Category, then "<Mon> budget" and "<Mon> paid" for each
 * month. Totals columns are ignored. A row's usual amount is the budget it has most often; other
 * months' budgets become that month's own amount, and paid amounts become payments.
 */

import { splitCsv } from "./bank-csv";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const YEAR_CSV_TEMPLATE =
  ["Item", "Kind", "Category", ...MONTHS.flatMap((m) => [`${m[0].toUpperCase()}${m.slice(1)} budget`, `${m[0].toUpperCase()}${m.slice(1)} paid`])].join(",") +
  "\r\n" +
  ["Electric", "Bill", "Utilities", ...MONTHS.flatMap(() => ["150.00", ""])].join(",") +
  "\r\n" +
  ["Paycheck", "Income", "Paycheck", ...MONTHS.flatMap(() => ["3000.00", ""])].join(",") +
  "\r\n";

const money = (raw: string | undefined): string | null => {
  const s = (raw ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(n).toFixed(2) : null;
};

export function yearCsvToDocument(text: string, year: number, label = `Year ${year} (CSV)`) {
  const rows = splitCsv(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2) throw new Error("The file has no rows under the header");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const item = col("item");
  if (item < 0) throw new Error('The first row needs an "Item" column (download the template to see the layout)');
  const kind = col("kind");
  const category = col("category");
  const budgetCol = MONTHS.map((m) => col(`${m} budget`));
  const paidCol = MONTHS.map((m) => col(`${m} paid`));
  if (budgetCol.every((i) => i < 0) && paidCol.every((i) => i < 0)) throw new Error('No month columns found: they read "Jan budget", "Jan paid" and so on');

  const seen = new Map<string, number>();
  const lineItems = rows.slice(1).flatMap((r, n) => {
    const name = (r[item] ?? "").replace(/^'/, "").trim();
    if (!name || /^total/i.test(name)) return [];
    const k = (r[kind] ?? "").trim().toLowerCase();
    const budgets = budgetCol.map((i) => (i >= 0 ? money(r[i]) : null));
    const paid = paidCol.map((i) => (i >= 0 ? money(r[i]) : null));
    const months = MONTHS.map((_, i) => i + 1).filter((m) => (budgets[m - 1] && budgets[m - 1] !== "0.00") || (paid[m - 1] && paid[m - 1] !== "0.00"));
    if (!months.length) return [];
    // The usual amount: the budget seen most often (ties: the first).
    const counts = new Map<string, number>();
    for (const b of budgets) if (b && b !== "0.00") counts.set(b, (counts.get(b) ?? 0) + 1);
    const planned = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? paid.find((p) => p && p !== "0.00") ?? "0.00";
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const dup = (seen.get(base) ?? 0) + 1;
    seen.set(base, dup);
    return [
      {
        key: `${base}-${dup}-${n}`,
        name,
        suggestedKind: (k.startsWith("income") ? "INCOME" : "BILL") as "INCOME" | "BILL",
        categoryName: (r[category] ?? "").replace(/^'/, "").trim() || null,
        accountKey: null,
        plannedAmount: planned,
        dueDay: null,
        months,
        frequencyLabel: null,
        paymentUrl: null,
        monthlyOverrides: months.filter((m) => budgets[m - 1] && budgets[m - 1] !== planned).map((m) => ({ month: m, amount: budgets[m - 1]! })),
        actuals: months.filter((m) => paid[m - 1] && paid[m - 1] !== "0.00").map((m) => ({ month: m, amount: paid[m - 1]! })),
        warnings: [] as string[],
      },
    ];
  });
  if (!lineItems.length) throw new Error("No rows with amounts were found");
  const categories = [...new Set(lineItems.map((l) => l.categoryName).filter((c): c is string => !!c))].map((name) => ({ name }));
  return { version: 1 as const, year, sourceLabel: label, accounts: [], categories, lineItems, payDates: [], skipped: [], notes: [] };
}
