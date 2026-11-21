import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { getCashTiming } from "@/server/cash-timing";
import { cushionSetting } from "@/server/envelopes";
import { cushion as cushionOf, forecastTotals } from "@/lib/budget-forecast";
import { planForecastRows } from "@/server/plan-charts";
import { carryOver } from "../plan-charts";
import { ForecastCards, ForecastTable } from "./forecast";
import { MonthPicker, TabHeading, pickMonth } from "../shared";
import Link from "next/link";
import { reserveSetting } from "@/server/envelopes";
import { monthByCard, type CardRow, type Check } from "@/server/card-view";
import { statementView } from "@/server/statement-plan";
import { CardsTable, ChecksLine, PeriodBar, StatementCards, StatementPlan, StatementTable } from "./cards";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ m?: string; view?: string }> }) {
  const { m, view: card } = await searchParams;
  const picked = pickMonth(m);
  const plan = await getMonthPlan(picked.year, picked.month).catch((error: unknown) => (console.error("Month plan:", error), null));
  const current = !!plan && !plan.closed && plan.month === plan.today.slice(0, 7);
  const [cash, minimum, reserve] = await Promise.all([current ? getCashTiming(plan!.debt.cents).catch(() => null) : null, cushionSetting(), reserveSetting()]);

  const view = plan
    ? (() => {
        const rows = planForecastRows(plan);
        const base = forecastTotals(rows);
        // The unplanned reserve is part of the budget, and expected to be used until it is.
        const unplannedLeft = plan.closed ? 0 : Math.max(0, reserve - base.unplannedCents);
        const totals = { ...base, budgetCents: base.budgetCents + reserve, forecastCents: base.forecastCents + unplannedLeft, marginCents: base.marginCents + reserve - unplannedLeft };
        const [y, mo] = [Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7))];
        const monthEnd = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
        const monthStart = `${plan.month}-01`;
        const nextMonthStart = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
        const nextMonthName = new Date(Date.UTC(y, mo, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
        let cushion = null;
        if (current && cash?.check) {
          const carry = carryOver(plan, cash.check);
          const left = rows.filter((r) => r.tier === "ESSENTIAL" || r.tier === "FLEXIBLE").reduce((t, r) => t + Math.max(0, r.forecastCents - r.spentCents), 0);
          const net = plan.income.totalCents - plan.bills.totalCents - plan.debt.cents - totals.forecastCents;
          cushion = cushionOf(carry.nowCents, left, net, minimum);
        }
        return { rows, totals, monthEnd, monthStart, nextMonthStart, nextMonthName, cushion };
      })()
    : null;

  // The card breakdown, and the cards worth a statement view (a typical month over $100).
  const split: { cards: CardRow[]; checks: Check[] } = plan && view ? await monthByCard(plan, view.rows, reserve).catch((error: unknown) => (console.error("Card split:", error), { cards: [], checks: [] })) : { cards: [], checks: [] };
  const statementTabs = current ? split.cards.filter((c) => c.kind === "card" && c.closesOn && (c.typicalCents ?? 0) >= 10_000) : [];
  const tab = card === "cards" ? "cards" : card && statementTabs.some((c) => c.key === card) ? card : "month";
  const statement = tab !== "month" && tab !== "cards" ? await statementView(tab).catch(() => null) : null;
  const tabHref = (key: string) => {
    const q = new URLSearchParams();
    if (m && (key === "month" || key === "cards")) q.set("m", m);
    if (key !== "month") q.set("view", key);
    return `/insights/budget${q.size ? `?${q}` : ""}`;
  };
  const tabs = [{ key: "month", name: "Month" }, ...(split.cards.length ? [{ key: "cards", name: "By card" }] : []), ...statementTabs.map((c) => ({ key: c.key, name: `${c.name} statement` }))];
  const monthDay = plan ? (plan.closed ? plan.daysInMonth : Number(plan.today.slice(8, 10))) : 1;

  return (
    <div className="space-y-4">
      <InsightsTabs right={<MonthPicker {...{ path: "/insights/budget", year: picked.year, month: picked.month }} />} />
      <TabHeading title="Budget" />
      {tabs.length > 1 ? (
        <nav aria-label="Budget view" className="inline-flex flex-wrap gap-0.5 rounded-xl border border-line bg-surface p-1 text-sm font-semibold">
          {tabs.map((t) => (
            <Link key={t.key} href={tabHref(t.key)} scroll={false} aria-current={tab === t.key ? "page" : undefined} className={`rounded-lg px-3 py-1 ${tab === t.key ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
              {t.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {statement ? (
        <>
          <PeriodBar from={statement.from} to={statement.to} day={statement.day} days={statement.days} />
          <StatementCards v={statement} />
          <StatementPlan v={statement} />
          <StatementTable v={statement} />
          <ChecksLine checks={split.checks} />
        </>
      ) : null}
      {plan && view && !statement ? (
        <>
          <PeriodBar from={view.monthStart} to={view.monthEnd} day={monthDay} days={plan.daysInMonth} />
          <ForecastCards
            totals={view.totals}
            cushion={view.cushion}
            minimumCents={minimum}
            monthEnd={view.monthEnd}
            monthStart={view.monthStart}
            nextMonthStart={view.nextMonthStart}
            nextMonthName={view.nextMonthName}
            closed={plan.closed}
          />
          {tab === "cards" ? (
            <CardsTable cards={split.cards} closed={plan.closed} monthEnd={view.monthEnd} />
          ) : (
            <ForecastTable
              rows={view.rows}
              totals={view.totals}
              bills={{ billsCents: plan.bills.listCents, billsBudgetedCents: plan.bills.listBudgetedCents, billsPaidCents: plan.bills.listPaidCents, debtCents: plan.debt.cents, debtPaidCents: plan.debt.source === "paid" ? plan.debt.cents : 0, otherCents: plan.bills.otherCents, other: plan.bills.other, month: plan.month }}
              monthEnd={view.monthEnd}
              closed={plan.closed}
              reserveCents={reserve}
            />
          )}
          <ChecksLine checks={split.checks} />
        </>
      ) : null}
    </div>
  );
}
