import Link from "next/link";
import type { BudgetPlan } from "@/lib/budget-plan";
import { cardColor } from "@/lib/card-colors";
import { formatCents } from "@/lib/money";
import { Card } from "@/components/ui";

const whole = (cents: number) => formatCents(Math.round(cents / 100) * 100).replace(/\.00$/, "");
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The parts of the income bar, in order, with colors that stay apart in light and dark. */
const PARTS = [
  { key: "bankBillsCents", label: "Bills from the bank", color: "#64748b" },
  { key: "cardBillsCents", label: "Bills on cards", color: "#93a8e8" },
  { key: "cardSpendingCents", label: "Card spending", color: "#2851d6" },
  { key: "debitSpendingCents", label: "Debit and other spending", color: "#d97706" },
  { key: "payoffCents", label: "0% payoff", color: "#7c3aed" },
] as const;

/** 1. Where the income goes: the whole bar is income; a shortfall runs past its end. */
export function IncomeBar({ plan }: { plan: BudgetPlan }) {
  const b = plan.bar;
  const spent = PARTS.reduce((s, p) => s + b[p.key], 0);
  const scale = Math.max(plan.incomeCents, spent, 1);
  const pct = (cents: number) => `${(Math.max(0, cents) / scale) * 100}%`;
  const isShort = b.leftOverCents < 0;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Where the Income Goes</h2>
        <span className="text-xs text-muted">A typical month · bills from the plan, spending from the last three months</span>
      </div>
      <p className="mt-2 text-sm">
        <span className="tnum font-bold">{whole(plan.incomeCents)}</span> income a month
        {plan.incomeSource === "bank" ? " (recent deposits: the plan has no income items)" : ""}.{" "}
        {isShort ? (
          <span className="font-semibold text-danger">Spending and bills run about {whole(-b.leftOverCents)} a month past it.</span>
        ) : (
          <span className="font-semibold text-ok">About {whole(b.leftOverCents)} a month is left over.</span>
        )}
      </p>
      <div className="relative mt-4">
        <div className="flex h-8 overflow-hidden rounded-lg" role="img" aria-label={PARTS.map((p) => `${p.label} ${whole(b[p.key])}`).join(", ")}>
          {PARTS.map((p) => (b[p.key] > 0 ? <span key={p.key} className="h-full border-r-2 border-surface last:border-r-0" style={{ width: pct(b[p.key]), background: p.color }} title={`${p.label}: ${whole(b[p.key])}`} /> : null))}
          {!isShort && b.leftOverCents > 0 ? <span className="h-full bg-ok/70" style={{ width: pct(b.leftOverCents) }} title={`Left over: ${whole(b.leftOverCents)}`} /> : null}
        </div>
        {/* Where the income ends, when spending runs past it. */}
        {isShort ? (
          <>
            <span aria-hidden className="absolute -top-1 h-10 w-0.5 bg-foreground" style={{ left: pct(plan.incomeCents) }} />
            <span className="absolute -top-6 -translate-x-1/2 text-[11px] font-semibold" style={{ left: pct(plan.incomeCents) }}>
              income
            </span>
            <span aria-hidden className="absolute inset-y-0 rounded-r-lg" style={{ left: pct(plan.incomeCents), right: 0, background: "repeating-linear-gradient(135deg, transparent 0 5px, rgba(220,38,38,.55) 5px 8px)" }} />
          </>
        ) : null}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {PARTS.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="tnum font-semibold">
              {whole(b[p.key])} <span className="text-xs font-normal text-muted">{Math.round((b[p.key] / Math.max(plan.incomeCents, 1)) * 100)}%</span>
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span aria-hidden className={`h-3 w-3 shrink-0 rounded-sm ${isShort ? "bg-danger" : "bg-ok"}`} />
            {isShort ? "Short each month" : "Left over"}
          </span>
          <span className={`tnum font-semibold ${isShort ? "text-danger" : "text-ok"}`}>{whole(Math.abs(b.leftOverCents))}</span>
        </li>
      </ul>
    </Card>
  );
}

/** 2. The card budget: what can go on the cards, and on each card how much of the balance is bills and how much is spending. */
export function CardBudget({ plan }: { plan: BudgetPlan }) {
  const c = plan.cardBudget;
  if (!c.cards.length) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Card Budget</h2>
        <span className="text-xs text-muted">0% cards are left out: they&rsquo;re only being paid down</span>
      </div>
      {c.totalCents > 0 ? (
        <p className="mt-2 text-sm">
          The cards can take about <span className="tnum text-xl font-extrabold">{whole(c.totalCents)}</span> a month:{" "}
          <span className="tnum font-semibold">{whole(c.billsCents)}</span> for the bills on them and{" "}
          <span className="tnum font-semibold">{whole(c.spendingCents)}</span> for spending.
        </p>
      ) : (
        <p className="mt-2 text-sm font-semibold text-danger">Bills, debit spending and the 0% payoff already take the whole income, so there&rsquo;s no room on the cards.</p>
      )}
      {c.averageCents > 0 ? (
        <p className={`mt-1 text-xs ${c.averageCents > c.totalCents ? "text-danger" : "text-muted"}`}>
          They&rsquo;ve averaged {whole(c.averageCents)} a month
          {c.averageCents > c.totalCents ? `, about ${whole(c.averageCents - c.totalCents)} over` : ""}.
        </p>
      ) : null}

      <ul className="mt-4 space-y-5">
        {c.cards.map((card) => {
          const color = cardColor(card.color);
          const scale = Math.max(card.budgetCents, card.sinceBillsCents + card.sinceSpendingCents + card.billsToComeCents, 1);
          const pct = (cents: number) => `${(Math.max(0, cents) / scale) * 100}%`;
          const over = card.leftCents < 0;
          return (
            <li key={card.id} className="text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className="h-4 w-6 shrink-0 rounded-[3px]" style={{ background: color.background }} />
                  {card.name}
                </span>
                <span className="tnum text-xs text-muted">
                  Budget {whole(card.budgetCents)} = {whole(card.billsCents)} bills + {whole(card.spendingBudgetCents)} spending · usually {whole(card.averageSpendingCents)} spending
                </span>
              </div>
              <div className="relative mt-2">
              <div className="flex h-4 overflow-hidden rounded-md bg-neutral-soft" role="img" aria-label={`${card.name}: ${whole(card.sinceBillsCents)} bills and ${whole(card.sinceSpendingCents)} spending since ${short(card.periodFrom)}`}>
                <span className="h-full" style={{ width: pct(card.sinceBillsCents), background: "#93a8e8" }} />
                <span className="h-full border-l-2 border-surface" style={{ width: pct(card.billsToComeCents), background: "repeating-linear-gradient(135deg, transparent 0 4px, rgba(147,168,232,.8) 4px 6px)" }} />
                <span className={`h-full border-l-2 border-surface ${over ? "bg-danger" : "bg-accent"}`} style={{ width: pct(card.sinceSpendingCents) }} />
              </div>
              <span aria-hidden className="absolute -top-1 h-6 w-0.5 bg-foreground" style={{ left: pct(card.budgetCents) }} />
              </div>
              <p className="mt-2 text-xs text-muted">
                Since {card.periodIsStatement ? "the statement closed" : "the month began"} ({short(card.periodFrom)}):{" "}
                <span className="font-semibold text-foreground">{whole(card.sinceBillsCents)}</span> bills,{" "}
                <span className="font-semibold text-foreground">{whole(card.sinceSpendingCents)}</span> spending
                {card.billsToComeCents > 0 ? `, about ${whole(card.billsToComeCents)} in bills still to come` : ""}.{" "}
                <span className={`font-semibold ${over ? "text-danger" : "text-foreground"}`}>
                  {over ? `${whole(-card.leftCents)} over its spending budget.` : `${whole(card.leftCents)} of spending room left.`}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-muted">
        Light blue is bills (striped: bills still to come), blue is spending, the line is the card&rsquo;s budget. Spending room is shared
        out by how each card has been used; bills on a card come from Bills &amp; income (&ldquo;Charged to&rdquo;) or where they were paid.
      </p>
    </Card>
  );
}

/** 3. Category targets: essentials keep their usual amount; flexible categories share what's left. */
export function CategoryTargets({ plan, period }: { plan: BudgetPlan; period: string }) {
  const t = plan.categoryTargets;
  if (!t.rows.length) return null;
  const cut = Math.round((1 - t.flexibleScale) * 100);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Category Targets</h2>
        <span className="text-xs text-muted">Everyday spending, cards and debit together</span>
      </div>
      <p className="mt-2 text-sm">
        Everyday budget <span className="tnum font-bold">{whole(t.everydayBudgetCents)}</span> a month. This month:{" "}
        <span className="tnum font-semibold">{whole(t.monthSpentCents)}</span> spent,{" "}
        <span className={`tnum font-semibold ${t.leftCents < 0 ? "text-danger" : ""}`}>
          {t.leftCents >= 0 ? `${whole(t.leftCents)} left (about ${whole(t.perWeekLeftCents)} a week)` : `${whole(-t.leftCents)} over`}
        </span>
        .
      </p>
      <p className="mt-1 text-xs text-muted">
        {cut > 0
          ? `Essentials keep their usual amount; flexible categories come down about ${cut}% from usual to fit.`
          : "Everything fits at its usual amount."}
      </p>
      <ul className="mt-4 space-y-3">
        {t.rows.map((r) => {
          const scale = Math.max(r.targetCents, r.monthCents, r.averageCents, 1);
          const pct = (cents: number) => `${(Math.max(0, cents) / scale) * 100}%`;
          const over = r.monthCents > r.targetCents;
          return (
            <li key={r.id ?? "none"}>
              <Link href={r.id ? `/insights/category/${r.id}?m=${period}` : "/insights/uncategorized"} className="group block">
                <span className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold group-hover:underline">
                    {r.name}
                    {r.essential ? <span className="ml-2 rounded bg-neutral-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">Essential</span> : null}
                  </span>
                  <span className="tnum">
                    <span className={`font-semibold ${over ? "text-danger" : ""}`}>{whole(r.monthCents)}</span>
                    <span className="text-muted"> of {whole(r.targetCents)}</span>
                    {!r.essential && r.targetCents < r.averageCents ? <span className="ml-2 text-xs text-muted">usually {whole(r.averageCents)}</span> : null}
                  </span>
                </span>
                <span className="relative mt-1.5 block h-2 rounded-full bg-neutral-soft">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-danger" : "bg-accent"}`} style={{ width: pct(r.monthCents) }} />
                  <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/70 ring-2 ring-surface" style={{ left: `calc(${pct(r.targetCents)} - 1px)` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">The line is each category&rsquo;s target for the month; tap one for its charges.</p>
    </Card>
  );
}
