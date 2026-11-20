/**
 * Bills that pay off a balance (src/lib/payoff.ts): what's left on each, and
 * ending a bill on its own once it's paid off.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { payoffStatus, type PayoffStatus } from "@/lib/payoff";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export interface Payoff extends PayoffStatus {
  lineItemId: string;
  name: string;
  plannedCents: number;
  endYear: number | null;
  endMonth: number | null;
  aprBps: number | null;
  escrowCents: number | null;
  /** When the balance was entered (a balance from the bank has none). */
  asOf: string | null;
}

export async function listPayoffs(today = localToday()): Promise<Payoff[]> {
  const items = (await prisma.lineItem.findMany({
    where: { active: true, OR: [{ payoffBalance: { not: null } }, { payoffAccountId: { not: null } }] },
    select: {
      id: true, name: true, plannedAmount: true, months: true, endYear: true, endMonth: true, payoffBalance: true, payoffAsOf: true, payoffAprBps: true, payoffEscrowCents: true, categoryId: true,
      payoffAccount: { select: { balance: true } },
      actuals: { select: { year: true, month: true, amount: true, paidOn: true } },
    },
  })) as Array<{
    id: string; name: string; plannedAmount: { toString(): string }; months: number[]; endYear: number | null; endMonth: number | null;
    payoffBalance: { toString(): string } | null; payoffAsOf: Date | null; payoffAprBps: number | null; payoffEscrowCents: number | null; categoryId: string | null;
    payoffAccount: { balance: { toString(): string } | null } | null;
    actuals: Array<{ year: number; month: number; amount: { toString(): string }; paidOn: Date | null }>;
  }>;
  const out: Payoff[] = [];
  for (const i of items) {
    const status = payoffStatus({
      accountBalanceCents: i.payoffAccount ? Math.abs(i.payoffAccount.balance === null ? 0 : toCents(i.payoffAccount.balance)) : null,
      balanceCents: i.payoffAccount ? null : i.payoffBalance ? toCents(i.payoffBalance) : null,
      asOf: i.payoffAsOf ? iso(i.payoffAsOf) : null,
      payments: i.actuals.map((a) => ({
        paidOn: a.paidOn ? iso(a.paidOn) : `${a.year}-${String(a.month).padStart(2, "0")}-01`,
        cents: toCents(a.amount),
        year: a.year,
        month: a.month,
      })),
      plannedCents: toCents(i.plannedAmount),
      months: i.months,
      today,
      aprBps: i.payoffAprBps,
      escrowCents: i.payoffEscrowCents,
    });
    if (status) out.push({ ...status, lineItemId: i.id, name: i.name, plannedCents: toCents(i.plannedAmount), endYear: i.endYear, endMonth: i.endMonth, aprBps: i.payoffAprBps, escrowCents: i.payoffEscrowCents, asOf: i.payoffAsOf ? iso(i.payoffAsOf) : null });
  }
  return out.sort((a, b) => (a.lastYear ?? 9999) * 12 + (a.lastMonth ?? 0) - ((b.lastYear ?? 9999) * 12 + (b.lastMonth ?? 0)));
}

/** A paid-off bill ends with its last payment's month (or this one), so it drops off the plan. */
export async function closePaidOffBills(today = localToday()): Promise<number> {
  let closed = 0;
  for (const p of await listPayoffs(today)) {
    if (!p.paidOff || p.endYear !== null) continue;
    const year = p.latestPaidYear ?? Number(today.slice(0, 4));
    const month = p.latestPaidMonth ?? Number(today.slice(5, 7));
    await prisma.lineItem.update({ where: { id: p.lineItemId }, data: { endYear: year, endMonth: month } });
    closed += 1;
  }
  return closed;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "$2,250.00 left · 9 payments · last one Aug 2027", or "Paid off". */
export function payoffLine(p: PayoffStatus, money: (cents: number) => string): string {
  if (p.paidOff) return "Paid off";
  const parts = [`${money(p.remainingCents)} left`];
  if (p.paymentsLeft) parts.push(`${p.paymentsLeft} payment${p.paymentsLeft === 1 ? "" : "s"}`);
  if (p.lastYear && p.lastMonth) parts.push(`last one ${MONTHS[p.lastMonth - 1]} ${p.lastYear}`);
  if (p.source === "bank") parts.push("from the bank");
  return parts.join(" · ");
}
