/**
 * A bill's usual amount over time. Rates change (water, power, insurance, a mortgage's escrow), so
 * a new amount applies from a month on and the months before keep what they were: those months
 * get a stored amount marked "rate" (MonthlyPlan.note), which every view already prefers to the
 * usual amount. Payments are checked too: a stretch of about-the-same payments suggests the usual
 * amount (Review), and can set the budgets of the months it covers to what was really paid.
 */

import { prisma } from "@/lib/prisma";
import { toCents, toDecimalString } from "@/lib/money";
import { amountRuns, monthsFromTo, shiftYm, suggestAmount, type AmountRun, type AmountSuggestion, type Payment } from "@/lib/amount-runs";
import { NotFoundError, ValidationError } from "./errors";

/** Marks a month's stored amount as the rate back then, not a one-month change. */
export const RATE_NOTE = "rate";

const KEY_TARGETS = "billTargets";

/** Bills set as targets (water, power): their amount moves every month, so only the typical payment is checked. */
export async function billTargets(): Promise<Set<string>> {
  const row = (await prisma.setting.findUnique({ where: { key: KEY_TARGETS } })) as { value: unknown } | null;
  return new Set(Array.isArray(row?.value) ? (row!.value as unknown[]).filter((x): x is string => typeof x === "string") : []);
}

export async function setBillTarget(id: string, on: boolean): Promise<void> {
  const ids = await billTargets();
  if (on === ids.has(id)) return;
  if (on) ids.add(id);
  else ids.delete(id);
  await prisma.setting.upsert({ where: { key: KEY_TARGETS }, create: { key: KEY_TARGETS, value: [...ids] as never }, update: { value: [...ids] as never } });
}

const ymOf = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const nowYm = () => new Date().toISOString().slice(0, 7);

type Item = {
  id: string;
  name: string;
  kind: string;
  plannedAmount: { toString(): string };
  months: number[];
  scheduleKind: string;
  onlyYear: number | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  payoffEscrowCents: number | null;
  paysCardId: string | null;
  active: boolean;
  paidFromSurplus: boolean;
};
const ITEM_SELECT = {
  id: true, name: true, kind: true, plannedAmount: true, months: true, scheduleKind: true, onlyYear: true,
  startYear: true, startMonth: true, endYear: true, endMonth: true, payoffEscrowCents: true, paysCardId: true, active: true, paidFromSurplus: true,
} as const;

/** Whether the bill is due in that month by its schedule (start, end, months, one-off year). */
function dueIn(item: Item, ym: string): boolean {
  const [y, m] = ym.split("-").map(Number);
  if (!item.months.includes(m)) return false;
  if (item.scheduleKind === "ONE_OFF" && item.onlyYear !== null && item.onlyYear !== y) return false;
  if (item.startYear && ym < ymOf(item.startYear, item.startMonth ?? 1)) return false;
  if (item.endYear && ym > ymOf(item.endYear, item.endMonth ?? 12)) return false;
  return true;
}

async function getItem(id: string): Promise<Item> {
  const item = (await prisma.lineItem.findUnique({ where: { id }, select: ITEM_SELECT })) as Item | null;
  if (!item) throw new NotFoundError("Line item");
  return item;
}

async function paymentsOf(id: string): Promise<Payment[]> {
  const rows = (await prisma.actualEntry.findMany({ where: { lineItemId: id }, select: { year: true, month: true, amount: true } })) as Array<{ year: number; month: number; amount: { toString(): string } }>;
  return rows.map((r) => ({ ym: ymOf(r.year, r.month), cents: toCents(r.amount) }));
}

/** The first month from now on that the bill is due and not yet paid: where a new amount starts. */
async function firstOpenMonth(item: Item, payments?: Payment[]): Promise<string> {
  const paid = new Set((payments ?? (await paymentsOf(item.id))).map((p) => p.ym));
  for (let i = 0; i < 24; i += 1) {
    const ym = shiftYm(nowYm(), i);
    if (dueIn(item, ym) && !paid.has(ym)) return ym;
  }
  return nowYm();
}

export interface BillAmountHistory {
  usualCents: number;
  /** Set as a target: only the typical payment is checked. */
  target: boolean;
  /** Stretches of about-the-same payments, newest first. */
  runs: AmountRun[];
  suggestion: AmountSuggestion | null;
  /** Where a new amount would start (YYYY-MM). */
  startsFrom: string;
  payments: number;
  escrowCents: number | null;
}

export async function billAmountHistory(id: string): Promise<BillAmountHistory> {
  const item = await getItem(id);
  const payments = await paymentsOf(id);
  const usualCents = toCents(item.plannedAmount);
  const target = (await billTargets()).has(id);
  return {
    usualCents,
    target,
    runs: amountRuns(payments).reverse(),
    suggestion: suggestAmount(payments, usualCents, nowYm(), target),
    startsFrom: await firstOpenMonth(item, payments),
    payments: payments.length,
    escrowCents: item.payoffEscrowCents,
  };
}

export interface AmountReviewItem {
  lineItemId: string;
  name: string;
  usualCents: number;
  suggestion: AmountSuggestion;
  startsFrom: string;
  hasEscrow: boolean;
  /** Older stretches whose months' budgets don't match what was paid. */
  pastToFix: number;
}

/** Bills whose payments say the usual amount is off, for Review. Card payments and paychecks aren't checked. */
export async function amountSuggestions(): Promise<AmountReviewItem[]> {
  const items = (await prisma.lineItem.findMany({
    where: { active: true, kind: { not: "INCOME" }, paysCardId: null, paidFromSurplus: false, scheduleKind: { not: "ONE_OFF" } },
    select: ITEM_SELECT,
  })) as Item[];
  if (!items.length) return [];
  const ids = items.map((i) => i.id);
  const [actuals, plans, dismissed] = (await Promise.all([
    prisma.actualEntry.findMany({ where: { lineItemId: { in: ids } }, select: { lineItemId: true, year: true, month: true, amount: true } }),
    prisma.monthlyPlan.findMany({ where: { lineItemId: { in: ids } }, select: { lineItemId: true, year: true, month: true, amount: true } }),
    prisma.reviewDismissal.findMany({ where: { kind: "amount" }, select: { key: true } }),
  ])) as [
    Array<{ lineItemId: string; year: number; month: number; amount: { toString(): string } }>,
    Array<{ lineItemId: string; year: number; month: number; amount: { toString(): string } | null }>,
    Array<{ key: string }>,
  ];
  const skip = new Set(dismissed.map((d) => d.key));
  const targets = await billTargets();
  const byItem = new Map<string, Payment[]>();
  for (const a of actuals) byItem.set(a.lineItemId, [...(byItem.get(a.lineItemId) ?? []), { ym: ymOf(a.year, a.month), cents: toCents(a.amount) }]);
  const planned = new Map(plans.map((p) => [`${p.lineItemId}:${ymOf(p.year, p.month)}`, p.amount === null ? null : toCents(p.amount)]));
  const out: AmountReviewItem[] = [];
  for (const item of items) {
    const payments = byItem.get(item.id) ?? [];
    if (payments.length < 3) continue;
    const usualCents = toCents(item.plannedAmount);
    const suggestion = suggestAmount(payments, usualCents, nowYm(), targets.has(item.id));
    if (!suggestion || skip.has(`${item.id}:${suggestion.cents}`)) continue;
    const pastToFix = amountRuns(payments)
      .slice(0, -1)
      .filter((r) => r.months.some((ym) => {
        const b = planned.get(`${item.id}:${ym}`);
        return Math.abs((b ?? usualCents) - r.cents) > Math.max(200, r.cents * 0.02);
      })).length;
    out.push({ lineItemId: item.id, name: item.name, usualCents, suggestion, startsFrom: await firstOpenMonth(item, payments), hasEscrow: !!item.payoffEscrowCents, pastToFix });
  }
  return out.sort((a, b) => Math.abs(b.suggestion.cents - b.usualCents) - Math.abs(a.suggestion.cents - a.usualCents));
}

/**
 * Before the usual amount changes from `from` (YYYY-MM) on: the months before it that the bill was
 * due and have no amount of their own keep the old one; "rate" amounts from `from` on are dropped
 * (the new usual amount covers them). Changes made to one month by hand are left alone.
 */
export async function keepEarlierAmount(id: string, oldCents: number, from: string): Promise<number> {
  const item = await getItem(id);
  const [actuals, plans] = (await Promise.all([
    prisma.actualEntry.findMany({ where: { lineItemId: id }, select: { year: true, month: true } }),
    prisma.monthlyPlan.findMany({ where: { lineItemId: id }, select: { id: true, year: true, month: true, note: true } }),
  ])) as [Array<{ year: number; month: number }>, Array<{ id: string; year: number; month: number; note: string | null }>];
  // Notes are sealed at rest, so they're compared after reading, never in the query.
  const later = plans.filter((p) => p.note === RATE_NOTE && ymOf(p.year, p.month) >= from);
  if (later.length) await prisma.monthlyPlan.deleteMany({ where: { id: { in: later.map((p) => p.id) } } });
  const known = [...actuals, ...plans].map((r) => ymOf(r.year, r.month));
  if (item.startYear) known.push(ymOf(item.startYear, item.startMonth ?? 1));
  const first = known.sort()[0];
  if (!first || first >= from) return 0;
  const has = new Set(plans.map((p) => ymOf(p.year, p.month)));
  const fill = monthsFromTo(first, shiftYm(from, -1)).filter((ym) => dueIn(item, ym) && !has.has(ym));
  if (!fill.length) return 0;
  await prisma.monthlyPlan.createMany({
    data: fill.map((ym) => ({ lineItemId: id, year: Number(ym.slice(0, 4)), month: Number(ym.slice(5)), amount: toDecimalString(oldCents), note: RATE_NOTE })),
    skipDuplicates: true,
  });
  return fill.length;
}

/**
 * Changes the usual amount from a month on (or for every month, past too, with "all"). With
 * `escrowFollows`, a loan's escrow part moves by the same amount (the loan's own payment stays).
 */
export async function changeUsualAmount(id: string, cents: number, from: string | "all", escrowFollows = false): Promise<void> {
  if (!Number.isFinite(cents) || cents <= 0 || cents >= 1e11) throw new ValidationError({ cents: ["Enter the amount"] });
  if (from !== "all" && !/^\d{4}-\d{2}$/.test(from)) throw new ValidationError({ from: ["Pick a month"] });
  const item = await getItem(id);
  const oldCents = toCents(item.plannedAmount);
  if (from === "all") {
    const rates = ((await prisma.monthlyPlan.findMany({ where: { lineItemId: id }, select: { id: true, note: true } })) as Array<{ id: string; note: string | null }>).filter((p) => p.note === RATE_NOTE);
    if (rates.length) await prisma.monthlyPlan.deleteMany({ where: { id: { in: rates.map((p) => p.id) } } });
  } else await keepEarlierAmount(id, oldCents, from);
  // The escrow moves by what the payment last changed by (the stretch before this one), not by
  // the gap from a usual amount that may never have been updated.
  let delta = cents - oldCents;
  if (escrowFollows && item.payoffEscrowCents) {
    const runs = amountRuns(await paymentsOf(id));
    const last = runs[runs.length - 1];
    if (last && runs.length > 1 && Math.abs(last.cents - cents) <= Math.max(200, cents * 0.02)) delta = cents - runs[runs.length - 2].cents;
  }
  const escrow = escrowFollows && item.payoffEscrowCents ? Math.max(0, item.payoffEscrowCents + delta) : undefined;
  await prisma.lineItem.update({ where: { id }, data: { plannedAmount: toDecimalString(Math.round(cents)), ...(escrow !== undefined ? { payoffEscrowCents: escrow } : {}) } });
}

/**
 * The Tracker's "from now on": the usual amount changes from [year]-[month], and one-month amounts
 * set by hand in that month and later go, so the one amount shows everywhere.
 */
export async function setAmountFrom(id: string, year: number, month: number, cents: number): Promise<void> {
  const plans = (await prisma.monthlyPlan.findMany({ where: { lineItemId: id }, select: { id: true, year: true, month: true, note: true, skipped: true } })) as Array<{ id: string; year: number; month: number; note: string | null; skipped: boolean }>;
  const later = plans.filter((p) => p.year * 12 + p.month >= year * 12 + month && !p.skipped && p.note !== RATE_NOTE);
  if (later.length) await prisma.monthlyPlan.deleteMany({ where: { id: { in: later.map((p) => p.id) } } });
  await changeUsualAmount(id, cents, ymOf(year, month));
}

/**
 * Sets the budgets of past months to what was paid, wherever three or more payments in a row were
 * about the same: each month in such a stretch gets the stretch's amount. Months skipped on
 * purpose and this month on are left alone. Returns how many months changed.
 */
export async function matchPastToPayments(id: string): Promise<number> {
  const item = await getItem(id);
  const runs = amountRuns(await paymentsOf(id));
  const plans = (await prisma.monthlyPlan.findMany({ where: { lineItemId: id }, select: { year: true, month: true, amount: true, skipped: true } })) as Array<{ year: number; month: number; amount: { toString(): string } | null; skipped: boolean }>;
  const byYm = new Map(plans.map((p) => [ymOf(p.year, p.month), p]));
  const usual = toCents(item.plannedAmount);
  const now = nowYm();
  let changed = 0;
  for (const run of runs) {
    for (const ym of monthsFromTo(run.from, run.to)) {
      if (ym >= now || !dueIn(item, ym)) continue;
      const had = byYm.get(ym);
      if (had?.skipped) continue;
      const current = had?.amount ? toCents(had.amount) : usual;
      if (current === run.cents && had) continue;
      const [year, month] = [Number(ym.slice(0, 4)), Number(ym.slice(5))];
      await prisma.monthlyPlan.upsert({
        where: { lineItemId_year_month: { lineItemId: id, year, month } },
        create: { lineItemId: id, year, month, amount: toDecimalString(run.cents), note: RATE_NOTE },
        update: { amount: toDecimalString(run.cents), note: RATE_NOTE },
      });
      changed += 1;
    }
  }
  return changed;
}

/** Hides one suggestion; a different amount later shows again. */
export async function dismissAmountSuggestion(id: string, cents: number): Promise<void> {
  const key = `${id}:${Math.round(cents)}`;
  await prisma.reviewDismissal.upsert({ where: { kind_key: { kind: "amount", key } }, create: { kind: "amount", key }, update: {} });
}
