import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan, type MonthPlanView } from "@/server/month-plan";
import { getCashTiming, worstCase } from "@/server/cash-timing";
import { budgetLeftOf } from "@/server/plan-charts";
import { getDebt, type DebtView } from "@/server/debt";
import { Card } from "@/components/ui";
import { PlanHero } from "./month-plan";
import { IncomeVsExpenses, carryOver } from "./plan-charts";
import { OutlookCards } from "./outlook";
import { cushionSetting } from "@/server/envelopes";
import { getOutlook, type OutlookView } from "@/server/outlook";
import { MonthPicker, TabHeading, monthLabel, pickMonth, shiftMonth } from "./shared";
import { planForecastRows } from "@/server/plan-charts";
import { monthByCard, statementView, type StatementView } from "@/server/card-view";
import { reserveSetting } from "@/server/envelopes";

export const dynamic = "force-dynamic";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;

/** A small tile for another tab: a title, one figure and one short line. The whole tile opens the tab. */
function Tile({ href, title, value, line, tone = "plain" }: { href: string; title: string; value: string; line?: string; tone?: "plain" | "danger" | "ok" | "warn" }) {
  const color = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "";
  return (
    <Link href={href} className="block min-w-0 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-card transition hover:ring-1 hover:ring-accent">
      <span className="block truncate text-xs font-semibold text-muted">{title}</span>
      <span className={`tnum block truncate text-lg font-bold leading-snug ${color}`}>{value}</span>
      {line ? <span className="block truncate text-xs text-muted">{line}</span> : null}
    </Link>
  );
}

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const md = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** One row: checking, the budget, the main card's statement, debt and last month. */
function Tiles({ plan, debt, last, check, statement }: { plan: MonthPlanView; debt: DebtView | null; last: MonthPlanView | null; check: { checkingCents: number; incomeCents: number } | null; statement: StatementView | null }) {
  const over = plan.groups.filter((g) => g.overCents > 0);
  const lastName = last ? monthLabel(Number(last.month.slice(0, 4)), Number(last.month.slice(5, 7)), "long").split(" ")[0] : "";
  const tiles = [
    check ? (
      <Tile key="checking" href="/insights/cash" title="Checking" value={money(check.checkingCents)} tone={check.checkingCents < 0 ? "danger" : "plain"} line={check.incomeCents > 0 ? `+${money(check.incomeCents)} pay still coming` : "No more pay this month"} />
    ) : (
      <Tile key="income" href="/insights/money" title="Income" value={money(plan.income.totalCents)} line={`${money(plan.income.receivedCents)} received`} />
    ),
    <Tile
      key="budget"
      href="/insights/budget"
      title="Budget"
      value={over.length ? `${over.length} over` : "On track"}
      line={over.length ? over.map((g) => g.name).slice(0, 3).join(", ") : `${money(plan.spentCents)} spent`}
      tone={over.length ? "warn" : "ok"}
    />,
    statement ? (
      <Tile
        key="statement"
        href={`/insights/budget?view=${statement.card.id}`}
        title={`${statement.card.name} · closes ${md(statement.to)}`}
        value={`${usd(statement.roomCents)} left`}
        tone={statement.roomCents < 0 ? "danger" : "ok"}
        line={`${usd(statement.chargedCents)} charged · ${usd(statement.projectedCents)} projected`}
      />
    ) : null,
    <Tile key="debt" href="/insights/debt" title="Debt" value={debt ? money(debt.totalCents) : "—"} line={debt ? `${money(debt.installmentCents)} loans · ${money(debt.revolvingCents)} cards` : undefined} />,
    <Tile
      key="last"
      href="/insights/trends"
      title={last ? `${lastName} Result` : "Last Month"}
      value={last ? (last.poolLeftCents < 0 ? money(last.poolLeftCents) : `+${money(last.poolLeftCents)}`) : "—"}
      line={last ? (last.poolLeftCents < 0 ? "spent more than came in" : "came in more than spent") : undefined}
      tone={last ? (last.poolLeftCents < 0 ? "danger" : "ok") : "plain"}
    />,
  ].filter(Boolean);
  return <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${tiles.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>{tiles}</div>;
}

export default async function InsightsOverview({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const picked = pickMonth(m);
  const plan = await getMonthPlan(picked.year, picked.month).catch((error: unknown) => (console.error("Month plan:", error), null));
  const prev = shiftMonth(picked.year, picked.month, -1);
  const isNow = !!plan && !plan.closed;
  // Everything after the plan runs side by side.
  const mainStatement = async (): Promise<StatementView | null> => {
    // The card with the biggest typical month, on its own statement today.
    const split = await monthByCard(plan!, planForecastRows(plan!), await reserveSetting()).catch(() => null);
    const main = split?.cards.filter((c) => c.kind === "card" && c.closesOn && (c.typicalCents ?? 0) >= 10_000).sort((a, b) => (b.typicalCents ?? 0) - (a.typicalCents ?? 0))[0];
    return main ? statementView(main.key).catch(() => null) : null;
  };
  const [cash, debt, last, cushion, statementNow] = plan
    ? await Promise.all([
        plan.closed ? Promise.resolve(null) : getCashTiming(plan.debt.cents).catch(() => null),
        getDebt(plan.debt.cents).catch((error: unknown) => (console.error("Debt:", error), null)),
        getMonthPlan(prev.year, prev.month).catch(() => null),
        cushionSetting(),
        isNow ? mainStatement() : Promise.resolve(null),
      ])
    : [null, null, null, 0, null];
  const current = !!(plan && cash && plan.month === cash.today.slice(0, 7));
  const outlook: OutlookView | null = current && cash?.check ? await getOutlook(cash.today, plan!.debt.cents).catch((error: unknown) => (console.error("Outlook:", error), null)) : null;
  const carry = plan && cash?.check ? carryOver(plan, cash.check) : null;
  // The bank balance as things stand: card payments leave on their due dates, nothing set aside.
  // Worst case: this month's budgets get used on the cards too (as on the Cash tab).
  const bank =
    cash && outlook && plan
      ? (() => {
          const path = (c: typeof cash) => {
            const upTo = c.steps.filter((st) => st.date <= outlook.to);
            const low = upTo.reduce((l, st) => (st.balanceCents < l.cents ? { cents: st.balanceCents, on: st.date } : l), { cents: c.startCents, on: c.today });
            return { lowCents: low.cents, lowOn: low.on, endCents: upTo.length ? upTo[upTo.length - 1].balanceCents : c.startCents, endOn: outlook.to };
          };
          return { best: path(cash), worst: path(worstCase(cash, budgetLeftOf(plan))) };
        })()
      : null;
  const statement = current ? statementNow : null;
  const thisMonth = plan ? monthLabel(Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7)), "long").split(" ")[0] : "";

  return (
    <div className="space-y-6">
      <InsightsTabs right={<MonthPicker {...{ path: "/insights", year: picked.year, month: picked.month }} />} />
      <TabHeading title="Overview" />
      {plan ? (
        <>
          <Tiles plan={plan} debt={debt} last={last} check={current && cash?.check ? cash.check : null} statement={statement} />
          <div className="grid gap-4 lg:grid-cols-2">
            <IncomeVsExpenses plan={plan} check={cash?.check} />
            <div className="flex flex-col gap-4">
              {outlook && carry ? (
                <OutlookCards outlook={outlook} carry={carry} thisMonth={thisMonth} bank={bank} cushionCents={cushion} />
              ) : (
                <PlanHero plan={plan} />
              )}
            </div>
          </div>
        </>
      ) : (
        <Card>
          <p className="text-sm text-muted">The plan couldn&rsquo;t be worked out. Check that the server can reach the database.</p>
        </Card>
      )}
    </div>
  );
}
