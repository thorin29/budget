import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan, type MonthPlanView } from "@/server/month-plan";
import { getCashTiming } from "@/server/cash-timing";
import { getDebt, type DebtView } from "@/server/debt";
import { Card } from "@/components/ui";
import { PlanHero } from "./month-plan";
import { IncomeVsExpenses, carryOver } from "./plan-charts";
import { OutlookCards } from "./outlook";
import { getOutlook, type OutlookView } from "@/server/outlook";
import { TabHeading, monthLabel, pickMonth, shiftMonth } from "./shared";

export const dynamic = "force-dynamic";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;

/** A tile for another tab: its headline number, one line, and a link. */
function Tile({ href, title, value, line, tone = "plain" }: { href: string; title: string; value: string; line: string; tone?: "plain" | "danger" | "ok" | "warn" }) {
  const color = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "";
  return (
    <Link href={href} className="group block rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:ring-1 hover:ring-accent">
      <span className="flex items-baseline justify-between text-sm font-semibold text-muted">
        {title}
        <span aria-hidden className="text-accent-text opacity-0 transition group-hover:opacity-100">
          ›
        </span>
      </span>
      <span className={`tnum mt-1 block text-2xl font-bold ${color}`}>{value}</span>
      <span className="mt-1 block text-xs text-muted">{line}</span>
    </Link>
  );
}

function Tiles({ plan, debt, last }: { plan: MonthPlanView; debt: DebtView | null; last: MonthPlanView | null }) {
  const outSoFar = plan.bills.paidCents + plan.spentCents + (plan.debt.source === "paid" ? plan.debt.cents : 0);
  const over = plan.groups.filter((g) => g.overCents > 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        href="/insights/money"
        title="Money"
        value={`${money(plan.income.receivedCents)} in`}
        line={`${money(outSoFar)} out so far · ${money(plan.income.totalCents)} expected in`}
      />
      <Tile
        href="/insights/budget"
        title="Budget"
        value={over.length ? `${over.length} over` : "Within limits"}
        line={over.length ? over.map((g) => g.name).slice(0, 3).join(", ") : `${money(plan.spentCents)} spent of the ${money(plan.poolCents)} pool`}
        tone={over.length ? "warn" : "ok"}
      />
      <Tile
        href="/insights/debt"
        title="Debt"
        value={debt ? money(debt.totalCents) : "—"}
        line={debt ? `${money(debt.installmentCents)} in loans · ${money(debt.revolvingCents)} on cards` : "Owed on loans and cards"}
      />
      <Tile
        href="/insights/trends"
        title="Trends"
        value={last ? (last.poolLeftCents < 0 ? `−${money(-last.poolLeftCents)}` : `+${money(last.poolLeftCents)}`) : "—"}
        line={last ? `${monthLabel(Number(last.month.slice(0, 4)), Number(last.month.slice(5, 7)), "short")}: money in less everything out` : "How the months compare"}
        tone={last ? (last.poolLeftCents < 0 ? "danger" : "ok") : "plain"}
      />
    </div>
  );
}

export default async function InsightsOverview({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const picked = pickMonth(m);
  const plan = await getMonthPlan(picked.year, picked.month).catch((error: unknown) => (console.error("Month plan:", error), null));
  const prev = shiftMonth(picked.year, picked.month, -1);
  const [cash, debt, last] = plan
    ? await Promise.all([
        plan.closed ? Promise.resolve(null) : getCashTiming(plan.debt.cents).catch(() => null),
        getDebt(plan.debt.cents).catch((error: unknown) => (console.error("Debt:", error), null)),
        getMonthPlan(prev.year, prev.month).catch(() => null),
      ])
    : [null, null, null];
  const current = !!(plan && cash && plan.month === cash.today.slice(0, 7));
  const outlook: OutlookView | null = current && cash?.check ? await getOutlook(cash.today, plan!.debt.cents).catch((error: unknown) => (console.error("Outlook:", error), null)) : null;
  const carry = plan && cash?.check ? carryOver(plan, cash.check) : null;
  const thisMonth = plan ? monthLabel(Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7)), "long").split(" ")[0] : "";

  return (
    <div className="space-y-6">
      <InsightsTabs />
      <TabHeading
        title="Overview"
        picker={{ path: "/insights", year: picked.year, month: picked.month }}
      />
      {plan ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <IncomeVsExpenses plan={plan} check={cash?.check} />
            <div className="flex flex-col gap-4">
              {outlook && carry ? (
                <OutlookCards outlook={outlook} carry={carry} thisMonth={thisMonth} />
              ) : (
                <PlanHero plan={plan} />
              )}
            </div>
          </div>
          <Tiles plan={plan} debt={debt} last={last} />
        </>
      ) : (
        <Card>
          <p className="text-sm text-muted">The plan couldn&rsquo;t be worked out. Check that the server can reach the database.</p>
        </Card>
      )}
    </div>
  );
}
