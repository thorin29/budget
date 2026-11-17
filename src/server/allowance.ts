/**
 * The monthly spending limit, from the plan (src/lib/allowance.ts): twelve
 * months of income and bills from the Year plan, the 0% payoff payments, and
 * everyday spending from the bank.
 */

import { prisma } from "@/lib/prisma";
import { allowance, type Allowance, type PlanRow } from "@/lib/allowance";
import { cardByName } from "@/lib/card-links";
import { getYearView } from "./year";
import { getInsights } from "./insights";
import { payoffTrackers } from "./card-payments";

function localNow(): { year: number; month: number } {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit" }).format(new Date());
  return { year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) };
}

export async function getAllowance(): Promise<Allowance | null> {
  const { year, month } = localNow();
  const [thisYear, nextYear, insights, payoff, items, cards] = await Promise.all([
    getYearView(year),
    month > 1 ? getYearView(year + 1) : Promise.resolve(null),
    getInsights(year, month),
    payoffTrackers(),
    prisma.lineItem.findMany({ select: { id: true, name: true, kind: true, paysCardId: true, paysCardLocked: true, paidFromSurplus: true } }) as Promise<
      Array<{ id: string; name: string; kind: string; paysCardId: string | null; paysCardLocked: boolean; paidFromSurplus: boolean }>
    >,
    prisma.bankAccount.findMany({ where: { type: "CREDIT_CARD", hidden: false }, select: { id: true, name: true, nickname: true, institution: true } }) as Promise<
      Array<{ id: string; name: string; nickname: string | null; institution: string | null }>
    >,
  ]);
  if (!thisYear.rows.length) return null;

  const byId = new Map(items.map((i) => [i.id, i]));
  const cardNames = cards.map((c) => ({ id: c.id, names: [c.nickname ?? "", c.name, c.institution ?? ""] }));
  const isCardPayment = (id: string) => {
    const i = byId.get(id);
    if (!i) return false;
    if (i.paysCardId || i.kind === "SETTLEMENT" || i.paidFromSurplus) return true;
    // Not linked yet: a bill named like one of the cards still pays it, unless set otherwise.
    return !i.paysCardLocked && i.kind === "BILL" && cardByName(i.name, cardNames) !== null;
  };

  // The next twelve months, this one first.
  const nextRows = new Map((nextYear?.rows ?? []).map((r) => [r.lineItemId, r]));
  const rows: PlanRow[] = thisYear.rows.map((r) => {
    const later = nextRows.get(r.lineItemId);
    const months = Array.from({ length: 12 }, (_, k) => {
      const m = month + k;
      const cell = m <= 12 ? r.cells[m - 1] : later?.cells[m - 13];
      return cell?.budgetedCents ?? 0;
    });
    return { name: r.name, kind: r.kind, months, cardPayment: isCardPayment(r.lineItemId) };
  });
  for (const r of nextYear?.rows ?? []) {
    if (thisYear.rows.some((t) => t.lineItemId === r.lineItemId)) continue;
    const months = Array.from({ length: 12 }, (_, k) => (month + k > 12 ? (r.cells[month + k - 13]?.budgetedCents ?? 0) : 0));
    rows.push({ name: r.name, kind: r.kind, months, cardPayment: isCardPayment(r.lineItemId) });
  }

  const complete = insights.months.slice(-4, -1).filter((m) => m.everydayCents > 0);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return allowance({
    rows,
    payoffCents: payoff.reduce((s, p) => s + p.monthlyCents, 0),
    depositsCents: complete.length ? Math.round(complete.reduce((s, m) => s + m.inCents, 0) / complete.length) : 0,
    recentEveryday: complete.map((m) => m.everydayCents),
    recentOnCards: complete.map((m) => m.onCardsCents),
    spentCents: insights.current.everydayCents,
    projectedCents: insights.pace?.projectedCents ?? null,
    day: insights.pace?.day ?? Number(new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", day: "2-digit" }).format(new Date())),
    daysInMonth,
  });
}
