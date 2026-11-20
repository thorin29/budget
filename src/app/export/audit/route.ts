/**
 * The audit file: everything stored (read through the app, so sealed fields arrive readable) and
 * the figures each page shows, month by month, in one JSON download. Sign-in data, the bank
 * connection's access link and API keys are left out. For checking the app's numbers end to end.
 */

import { requireUser } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { merchantKey } from "@/lib/field-crypto";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

const SECRET = /keyenc|accessurl|access_url|token|password|secret|apikey|hash/i;

/** Drops any field whose name looks like a secret, at any depth. */
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if (typeof (value as { toFixed?: unknown }).toFixed === "function" && typeof (value as { toString: () => string }).toString === "function" && "d" in (value as object)) {
      return (value as { toString: () => string }).toString(); // Prisma Decimal
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !SECRET.test(k)).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

/** Runs one piece; a failure is recorded as a finding instead of stopping the file. */
async function safe<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET() {
  try {
    await requireUser();
  } catch {
    return new Response("Sign in required", { status: 401 });
  }

  const [
    settingsRows, accounts, categories, groups, lineItems, plans, actuals, balances, schedules, payOverrides,
    bankAccounts, transactions, splits, billRules, categoryRules, dismissals, bankImports, importBatches,
    netWorth, forecasts, connection,
  ] = await Promise.all([
    prisma.setting.findMany(),
    prisma.account.findMany(),
    prisma.category.findMany(),
    prisma.categoryGroup.findMany(),
    prisma.lineItem.findMany(),
    prisma.monthlyPlan.findMany(),
    prisma.actualEntry.findMany(),
    prisma.balanceSnapshot.findMany(),
    prisma.paySchedule.findMany(),
    prisma.payDateOverride.findMany(),
    prisma.bankAccount.findMany(),
    prisma.bankTransaction.findMany({ orderBy: { postedOn: "asc" } }),
    prisma.transactionSplit.findMany(),
    prisma.billRule.findMany(),
    prisma.categoryRule.findMany(),
    prisma.reviewDismissal.findMany(),
    prisma.bankImport.findMany(),
    prisma.importBatch.findMany(),
    prisma.netWorthSnapshot.findMany({ orderBy: { month: "asc" } }),
    prisma.forecastPoint.findMany().catch(() => []),
    prisma.bankConnection.findUnique({ where: { id: "default" }, select: { host: true, lastSuccessAt: true, lastError: true } }).catch(() => null),
  ]);

  // Rules store a hashed merchant key; each transaction carries its key so the two can be joined.
  const txns = (transactions as Array<Record<string, unknown> & { merchant: string }>).map((t) => ({ ...t, merchantKey: merchantKey(t.merchant) }));

  // Every month with data, through next month.
  const yms = new Set<string>();
  const add = (y: number, m: number) => yms.add(`${y}-${String(m).padStart(2, "0")}`);
  for (const a of actuals as Array<{ year: number; month: number }>) add(a.year, a.month);
  for (const p of plans as Array<{ year: number; month: number }>) add(p.year, p.month);
  for (const t of transactions as Array<{ postedOn: Date }>) add(t.postedOn.getUTCFullYear(), t.postedOn.getUTCMonth() + 1);
  const now = new Date();
  add(now.getFullYear(), now.getMonth() + 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  add(next.getFullYear(), next.getMonth() + 1);
  const months = [...yms].sort();
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];

  const { getMonthView } = await import("@/server/month");
  const { getMonthPlan } = await import("@/server/month-plan");
  const { getInsights, getSuggestions } = await import("@/server/insights");
  const { getYearView } = await import("@/server/year");

  const perMonth: Record<string, unknown> = {};
  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    perMonth[ym] = {
      tracker: await safe(() => getMonthView(y, m)),
      plan: await safe(() => getMonthPlan(y, m)),
      insights: await safe(() => getInsights(y, m, 12, false)),
    };
  }
  const perYear: Record<string, unknown> = {};
  for (const y of years) perYear[y] = await safe(() => getYearView(y));

  const current = await safe(async () => {
    const { getMonthPlan: plan } = await import("@/server/month-plan");
    const p = await plan();
    const debtCents = p.debt.cents;
    const [{ getDebt }, { getNetWorth }, { cashCases }, { getCashTiming }, { getOutlook }, { getReview }, { recentAutomation }, { listPayoffs }, { listCardPayments, cardOverview }, { getBudgetPlan }, { amountSuggestions }, homes, { cushionSetting }] = await Promise.all([
      import("@/server/debt"), import("@/server/net-worth"), import("@/server/cash-cases"), import("@/server/cash-timing"), import("@/server/outlook"), import("@/server/review"),
      import("@/server/bills-auto"), import("@/server/payoff"), import("@/server/card-payments"), import("@/server/budget-plan"), import("@/server/bill-amounts"), import("@/server/home-value"), import("@/server/envelopes"),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return {
      debt: await safe(() => getDebt(debtCents)),
      netWorth: await safe(() => getNetWorth(debtCents)),
      cashCases: await safe(() => cashCases()),
      cashTiming: await safe(() => getCashTiming(debtCents)),
      outlook: await safe(() => getOutlook(today, debtCents)),
      review: await safe(() => getReview()),
      recentAutomation: await safe(() => recentAutomation()),
      payoffs: await safe(() => listPayoffs()),
      cardPayments: await safe(() => listCardPayments()),
      cardOverview: await safe(() => cardOverview()),
      budgetPlan: await safe(() => getBudgetPlan()),
      amountSuggestions: await safe(() => amountSuggestions()),
      suggestions: await safe(() => getSuggestions()),
      cushionCents: await safe(() => cushionSetting()),
      homes: await safe(async () => Promise.all((await homes.listHomes()).map((h) => homes.homeValue(h.id)))),
    };
  });

  const body = {
    meta: { app: "budget", version: APP_VERSION, exportedAt: new Date().toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, months, years },
    stored: {
      settings: settingsRows, accounts, categories, categoryGroups: groups, lineItems, monthlyPlans: plans, actuals, balanceSnapshots: balances,
      paySchedules: schedules, payDateOverrides: payOverrides, bankAccounts, transactions: txns, transactionSplits: splits, billRules, categoryRules,
      reviewDismissals: dismissals, bankImports, importBatches, netWorthSnapshots: netWorth, forecastPoints: forecasts, bankConnection: connection,
    },
    shown: { perMonth, perYear, current },
  };
  const json = JSON.stringify(scrub(body), (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="budget-audit-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
