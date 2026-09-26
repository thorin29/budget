/**
 * Month halves and what is owed.
 *
 * The month is split at a fixed day — a planning guideline, not a derivation
 * from paydays. Paydays are a reference calendar the projection uses; they do
 * not define these boundaries. A bill due on or before the split day sits in
 * the first half, after it in the second, and an explicit pin overrides both.
 *
 * Nothing here is persisted. Everything recomputes from the line items and
 * settings on each request.
 */

import type { PeriodAssignment } from "@/generated/prisma";

// ---------------------------------------------------------------- types

export interface MonthHalf {
  index: 0 | 1;
  label: string;
  /** Inclusive first day. */
  start: Date;
  /** Inclusive last day. */
  end: Date;
}

export interface LineItemForMonth {
  id: string;
  name: string;
  kind: "BILL" | "SETTLEMENT" | "INCOME";
  dueDay: number | null;
  periodAssignment: PeriodAssignment;
  months: number[];
  scheduleKind: string;
  onlyYear: number | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  active: boolean;
}

export interface Obligation {
  lineItemId: string;
  name: string;
  /** What is owed: the month override if present, else the planned amount. */
  amount: number;
  /** The month it belongs to — not necessarily the month being viewed. */
  year: number;
  month: number;
  dueDate: Date;
  half: 0 | 1;
  /** True when it originates in a month earlier than the one being viewed. */
  carriedOver: boolean;
}

// ---------------------------------------------------------------- date helpers

export const DAY_MS = 86_400_000;

export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function stripTime(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Months since year zero — for comparing (year, month) pairs as one number. */
function monthOrdinal(year: number, month: number): number {
  return year * 12 + month;
}

// ---------------------------------------------------------------- halves

/**
 * Split a month in two at `splitDay`. The default is the 15th; it is a setting
 * the user sets once, not something that moves month to month.
 */
export function monthHalves(
  year: number,
  month: number,
  splitDay = 15,
): [MonthHalf, MonthHalf] {
  const last = daysInMonth(year, month);
  const cut = Math.min(Math.max(splitDay, 1), last - 1);

  return [
    {
      index: 0,
      label: "First half",
      start: utcDate(year, month, 1),
      end: utcDate(year, month, cut),
    },
    {
      index: 1,
      label: "Second half",
      start: utcDate(year, month, cut + 1),
      end: utcDate(year, month, last),
    },
  ];
}

/**
 * Which half a line item belongs to. AUTO uses the due day; an explicit pin
 * wins regardless, for the bills paid on a different rhythm than their due date
 * implies.
 */
export function halfFor(
  dueDay: number | null,
  assignment: PeriodAssignment,
  splitDay = 15,
): 0 | 1 {
  switch (assignment) {
    case "FIRST":
      return 0;
    case "SECOND":
    case "THIRD":
    case "LAST":
      return 1;
    default:
      break;
  }

  // No due day means it cannot be placed by date; the first half owns it so it
  // is never dropped from the month's totals.
  if (dueDay == null) return 0;
  return dueDay <= splitDay ? 0 : 1;
}

// ---------------------------------------------------------------- due in month

/**
 * Whether an item is due in a given month, honouring its schedule and its
 * optional start and end bounds. Both bounds are empty unless deliberately set.
 */
export function isDueInMonth(
  item: LineItemForMonth,
  year: number,
  month: number,
): boolean {
  if (!item.active) return false;
  if (!item.months.includes(month)) return false;
  if (item.scheduleKind === "ONE_OFF" && item.onlyYear !== year) return false;

  const point = monthOrdinal(year, month);

  if (item.startYear != null) {
    if (point < monthOrdinal(item.startYear, item.startMonth ?? 1)) return false;
  }
  if (item.endYear != null) {
    if (point > monthOrdinal(item.endYear, item.endMonth ?? 12)) return false;
  }

  return true;
}

// ---------------------------------------------------------------- carryover

export interface PlanLookup {
  /** Month override, if one exists. */
  amount: number | null;
  /** Explicitly not due this month — distinct from an amount of zero. */
  skipped: boolean;
}

export interface BuildObligationsArgs {
  items: LineItemForMonth[];
  /** planned amount per line item id. */
  planned: Map<string, number>;
  /** `${lineItemId}:${year}:${month}` -> override. */
  plans: Map<string, PlanLookup>;
  /** `${lineItemId}:${year}:${month}` for every month already settled. */
  settled: Set<string>;
  year: number;
  month: number;
  splitDay?: number;
  /** How many prior months to sweep for unpaid bills. */
  carryMonths?: number;
}

/**
 * Everything owed as of the month being viewed: this month's due items plus any
 * unpaid item from earlier months, which keeps its original due date and is
 * flagged as carried over.
 *
 * A bill does not disappear at month end. It disappears when it is paid, or
 * when the month it belongs to is marked as nothing due.
 */
export function buildObligations({
  items,
  planned,
  plans,
  settled,
  year,
  month,
  splitDay = 15,
  carryMonths = 12,
}: BuildObligationsArgs): Obligation[] {
  const out: Obligation[] = [];
  const viewOrdinal = monthOrdinal(year, month);

  for (let back = carryMonths; back >= 0; back--) {
    const ord = viewOrdinal - back;
    const y = Math.floor((ord - 1) / 12);
    const m = ((ord - 1) % 12) + 1;

    for (const item of items) {
      if (item.kind === "INCOME") continue;
      if (!isDueInMonth(item, y, m)) continue;

      const key = `${item.id}:${y}:${m}`;
      if (settled.has(key)) continue;

      const plan = plans.get(key);
      // `skipped` is how a card with nothing owed this month is recorded. It is
      // not zero, and it is not unpaid — it simply is not an obligation.
      if (plan?.skipped) continue;

      const amount = plan?.amount ?? planned.get(item.id) ?? 0;
      if (amount === 0 && back > 0) continue; // don't carry empty rows forward

      const last = daysInMonth(y, m);
      const day = Math.min(Math.max(item.dueDay ?? 1, 1), last);

      out.push({
        lineItemId: item.id,
        name: item.name,
        amount,
        year: y,
        month: m,
        dueDate: utcDate(y, m, day),
        half: halfFor(item.dueDay, item.periodAssignment, splitDay),
        carriedOver: back > 0,
      });
    }
  }

  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

// ---------------------------------------------------------------- pay calendar

/**
 * Paydays across a date range. Reference only — the projection places expected
 * income on these dates. No boundary, total, or half is derived from them.
 */
export function payDatesBetween(
  frequency: "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY",
  anchorDate: Date | null,
  daysOfMonth: number[],
  from: Date,
  to: Date,
): Date[] {
  const start = stripTime(from);
  const end = stripTime(to);
  const out: Date[] = [];

  if (frequency === "WEEKLY" || frequency === "BIWEEKLY") {
    if (!anchorDate) return out;
    const step = frequency === "WEEKLY" ? 7 : 14;
    const anchor = stripTime(anchorDate);
    const steps = Math.ceil((start.getTime() - anchor.getTime()) / DAY_MS / step);
    let cursor = addDays(anchor, steps * step);
    while (cursor <= end) {
      if (cursor >= start) out.push(cursor);
      cursor = addDays(cursor, step);
    }
    return out;
  }

  const days = daysOfMonth.length
    ? daysOfMonth
    : frequency === "SEMI_MONTHLY"
      ? [15, 31]
      : [1];

  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  while (utcDate(y, m, 1) <= end) {
    const last = daysInMonth(y, m);
    for (const d of days) {
      const date = utcDate(y, m, Math.min(Math.max(d, 1), last));
      if (date >= start && date <= end) out.push(date);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out.sort((a, b) => a.getTime() - b.getTime());
}
