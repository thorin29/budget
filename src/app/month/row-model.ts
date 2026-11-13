/**
 * Shapes the month view's entries for the client: plain data, with the due
 * date, status and default payment date worked out once on the server so the
 * browser and the server never disagree about "today".
 */

import type { MonthEntry } from "@/server/month";

export type RowStatus =
  | "paid"
  | "received"
  | "expected"
  | "carried"
  | "overdue"
  | "soon"
  | "upcoming";

export interface RowEntry {
  lineItemId: string;
  name: string;
  /** The month the entry belongs to, which is where a payment is recorded. */
  year: number;
  month: number;
  kind: MonthEntry["kind"];
  categoryName: string | null;
  accountName: string | null;
  paymentUrl: string | null;
  budgetedCents: number;
  plannedCents: number;
  actualCents: number | null;
  adjusted: boolean;
  /** YYYY-MM-DD, or null when the item has no due day. */
  dueDate: string | null;
  /** YYYY-MM-DD the confirm panel starts on. */
  defaultPaidOn: string;
  paidOn: string | null;
  status: RowStatus;
  /** Whole days until due; negative when past. Null without a due day. */
  daysUntilDue: number | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The server's local date as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export function toRow(entry: MonthEntry, today: string): RowEntry {
  const dueDate = entry.dueDay
    ? isoDate(entry.year, entry.month, Math.min(entry.dueDay, daysIn(entry.year, entry.month)))
    : null;

  const daysUntilDue = dueDate ? Math.round(dayNumber(dueDate) - dayNumber(today)) : null;

  const monthStart = isoDate(entry.year, entry.month, 1);
  const monthEnd = isoDate(entry.year, entry.month, daysIn(entry.year, entry.month));
  const todayInMonth = today >= monthStart && today <= monthEnd;

  let status: RowStatus;
  if (entry.kind === "INCOME") {
    status = entry.actualCents === null ? "expected" : "received";
  } else if (entry.actualCents !== null) {
    status = "paid";
  } else if (entry.carriedFrom) {
    status = "carried";
  } else if (daysUntilDue !== null && daysUntilDue < 0) {
    status = "overdue";
  } else if (daysUntilDue !== null && daysUntilDue <= 7) {
    status = "soon";
  } else {
    status = "upcoming";
  }

  const defaultPaidOn =
    entry.paidOn ??
    (entry.carriedFrom || todayInMonth ? today : (dueDate ?? monthStart));

  return {
    lineItemId: entry.lineItemId,
    name: entry.name,
    year: entry.year,
    month: entry.month,
    kind: entry.kind,
    categoryName: entry.categoryName,
    accountName: entry.accountName,
    paymentUrl: entry.paymentUrl,
    budgetedCents: entry.budgetedCents,
    plannedCents: entry.plannedCents,
    actualCents: entry.actualCents,
    adjusted: entry.adjusted,
    dueDate,
    defaultPaidOn,
    paidOn: entry.paidOn,
    status,
    daysUntilDue,
  };
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-11-21" -> "Nov 21". */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

export function shortMonth(month: number): string {
  return MONTH_SHORT[month - 1];
}
