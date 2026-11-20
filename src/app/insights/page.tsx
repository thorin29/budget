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

/** A tile for another tab: its headline, then either one line or a few label/amount rows. */
function Tile({ href, title, value, line, rows, tone = "plain" }: { href: string; title: string; value?: string; line?: string; rows?: Array<[string, number, string?]>; tone?: "plain" | "danger" | "ok" | "warn" }) {
  const color = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "";
  return (
    <Link href={href} className="group block rounded-2xl border border-line bg-surface px-4 py-3 shadow-card transition hover:ring-1 hover:ring-accent">
      <span className="flex items-baseline justify-between text-sm font-semibold text-muted">
        {title}
        <span aria-hidden className="text-accent-text opacity-0 transition group-hover:opacity-100">
          ›
        </span>
      </span>
      {rows ? (
        <span className="mt-1 block space-y-0.5">
          {rows.map(([label, cents, cls]) => (
            <span key={label} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted">{label}</span>
              <span className={`tnum font-bold ${cls ?? ""}`}>{money(cents)}</span>
            </span>
          ))}
        </span>
      ) : (
        <>
          <span className={`tnum mt-0.5 block text-xl font-bold ${color}`}>{value}</span>
          {line ? <span className="block truncate text-xs text-muted">{line}</span> : null}
        </>
      )}
    </Link>
  );
}

function Tiles({ plan, debt, last, checkingCents }: { plan: MonthPlanView; debt: DebtView | null; last: MonthPlanView | null; checkingCents: number | null }) {
  const over = plan.groups.filter((g) => g.overCents > 0);
  const expenses = plan.bills.totalCents + plan.debt.cents + plan.spentCents;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        href="/insights/money"
        title="Money"
        rows={[
          ...(checkingCents !== null ? ([["Checking", checkingCents, checkingCents < 0 ? "text-danger" : ""]] as Array<[string, number, string]>) : []),
          ["Income", plan.income.totalCents, "text-ok"],
          ["Expenses", expenses, expenses > plan.income.totalCents ? "text-danger" : ""],
        ]}
      />
      <Tile
        href="/insights/budget"
        title="Budget"
        value={over.length ? `${over.length} over` : "Within limits"}
        line={over.length ? over.map((g) => g.name).slice(0, 3).join(", ") : `${money(plan.spentCents)} spent of ${money(plan.poolCents)}`}
        tone={over.length ? "warn" : "ok"}
      />
      <Tile
        href="/insights/debt"
        title="Debt"
        value={debt ? money(debt.totalCents) : "—"}
        line={debt ? `${money(debt.installmentCents)} loans · ${money(debt.revolvingCents)} cards` : undefined}
      />
      <Tile
        href="/insights/trends"
        title="Trends"
        value={last ? (last.poolLeftCents < 0 ? `−${money(-last.poolLeftCents)}` : `+${money(last.poolLeftCents)}`) : "—"}
        line={last ? `${monthLabel(Number(last.month.slice(0, 4)), Number(last.month.slice(5, 7)), "long").split(" ")[0]}: income − expenses` : undefined}
        tone={last ? (last.poolLeftCents < 0 ? "danger" : "ok") : "plain"}
      />
    </div>
  );
}

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const md = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The main card on its own statement: charged so far, bills still to land, room left per day. */
function StatementTile({ v }: { v: StatementView }) {
  return (
    <Link href={`/insights/budget?view=${v.card.id}`} className="block rounded-2xl border border-line bg-surface px-5 py-4 shadow-card hover:border-line-strong">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-muted">
          {v.card.name} statement · {md(v.from)} – {md(v.to)} · day {v.day} of {v.days}
        </p>
        <span className="text-xs font-semibold text-accent-text">Open →</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <p><span className="block text-xs text-muted">Charged so far</span><span className="tnum text-xl font-bold">{usd(v.chargedCents)}</span></p>
        <p><span className="block text-xs text-muted">Bills still to come</span><span className="tnum text-xl font-bold">{usd(v.billsToComeCents)}</span></p>
        <p><span className="block text-xs text-muted">Room left in budgets</span><span className="tnum text-xl font-bold text-ok">{usd(v.roomCents)}</span>{v.daysLeft ? <span className="block text-xs text-muted">about {usd(v.roomCents / v.daysLeft)} a day</span> : null}</p>
        <p><span className="block text-xs text-muted">Statement, projected</span><span className="tnum text-xl font-bold">{usd(v.projectedCents)}</span>{v.dueOn ? <span className="block text-xs text-muted">due {md(v.dueOn)}</span> : null}</p>
      </div>
    </Link>
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
  const cushion = await cushionSetting();
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
  // Where the main card stands on its own statement today (the card with the biggest typical month).
  let statement: StatementView | null = null;
  if (current && plan) {
    const split = await monthByCard(plan, planForecastRows(plan), await reserveSetting()).catch(() => null);
    const main = split?.cards.filter((c) => c.kind === "card" && c.closesOn && (c.typicalCents ?? 0) >= 10_000).sort((a, b) => (b.typicalCents ?? 0) - (a.typicalCents ?? 0))[0];
    if (main) statement = await statementView(main.key).catch(() => null);
  }
  const thisMonth = plan ? monthLabel(Number(plan.month.slice(0, 4)), Number(plan.month.slice(5, 7)), "long").split(" ")[0] : "";

  return (
    <div className="space-y-6">
      <InsightsTabs right={<MonthPicker {...{ path: "/insights", year: picked.year, month: picked.month }} />} />
      <TabHeading title="Overview" />
      {plan ? (
        <>
          <Tiles plan={plan} debt={debt} last={last} checkingCents={current && cash?.check ? cash.check.checkingCents : null} />
          {statement ? <StatementTile v={statement} /> : null}
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
