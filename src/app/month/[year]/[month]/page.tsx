import { cardOverview } from "@/server/card-payments";
import { CardDeck, CardTable, type DeckCard } from "../../card-deck";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getMonthView } from "@/server/month";
import { getMonthPlan } from "@/server/month-plan";
import { getProjection } from "@/server/projection-view";
import { formatCents } from "@/lib/money";
import { EmptyState, StatCard, buttonClass } from "@/components/ui";
import { BalanceChart, toChartPoints } from "@/components/balance-chart";
import { BalanceCard, MonthList, type MonthSection } from "../../rows";
import { getReview } from "@/server/review";
import { QuickEntry } from "../../quick-entry";
import { shortDate, shortMonth, todayIso, toRow, type RowEntry } from "../../row-model";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function shift(year: number, month: number, by: number) {
  const ordinal = year * 12 + (month - 1) + by;
  return { year: Math.floor(ordinal / 12), month: (ordinal % 12) + 1 };
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const paidOf = (rows: RowEntry[]) => rows.reduce((s, r) => s + (r.actualCents ?? 0), 0);
const budgetOf = (rows: RowEntry[]) => rows.reduce((s, r) => s + r.budgetedCents, 0);

export default async function MonthPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  const raw = await params;
  const year = Number(raw.year);
  const month = Number(raw.month);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    notFound();
  }

  const accountCount = await prisma.account.count();
  if (accountCount === 0) return <Welcome />;

  const [view, projection, review, plan] = await Promise.all([
    getMonthView(year, month),
    getProjection().catch(() => null),
    getReview().catch((error) => {
      console.error("Review:", error instanceof Error ? error.message : error);
      return null;
    }),
    // The same Bills figure the Insights tabs show.
    getMonthPlan(year, month).catch(() => null),
  ]);
  const billsSource = view.billsAccountId
    ? ((await prisma.bankAccount.findFirst({ where: { linkedAccountId: view.billsAccountId, hidden: false }, select: { balanceDate: true } })) as { balanceDate: Date | null } | null)
    : null;
  const billsFromBank = billsSource
    ? billsSource.balanceDate
      ? billsSource.balanceDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: process.env.TZ || "UTC" })
      : "waiting for the first sync"
    : null;
  const suggestions = new Map((review?.looksPaid ?? []).map((l) => [`${l.lineItemId}:${l.year}:${l.month}`, l]));
  const withSuggestion = (row: RowEntry): RowEntry => {
    const s = suggestions.get(`${row.lineItemId}:${row.year}:${row.month}`);
    return s ? { ...row, suggestion: { txnId: s.txnId, amountCents: s.amountCents, postedOn: s.postedOn, merchant: s.merchant, account: s.account } } : row;
  };

  const today = todayIso();
  const previous = shift(year, month, -1);
  const next = shift(year, month, 1);
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  const cards = isCurrent ? await cardOverview(today) : null;
  const deckCards: DeckCard[] = (cards?.rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    institution: r.institution,
    lastDigits: r.lastDigits,
    color: r.color,
    owedNowCents: r.owedNowCents,
    status: r.status
      ? {
          nextDue: r.status.nextDue,
          dueCents: r.status.dueCents,
          statementCents: r.status.statementCents,
          suggestedCents: r.status.suggestedCents,
          newChargesCents: r.status.newChargesCents,
          plan: r.status.plan,
          paymentsLeft: r.status.paymentsLeft,
          promoEndsOn: r.status.promoEndsOn,
        }
      : null,
  }));
  const daysUntil = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  const income = view.income.map((e) => withSuggestion(toRow(e, today)));
  const carried = view.carried.map((e) => withSuggestion(toRow(e, today)));
  const halves = view.halves.map((h) => h.entries.map((e) => withSuggestion(toRow(e, today))));
  const surplus = view.surplusItems.map((e) => withSuggestion(toRow(e, today)));

  const allRows = [...carried, ...halves[0], ...halves[1], ...surplus, ...income];
  const billRows = [...carried, ...halves[0], ...halves[1]];
  const unpaidBills = billRows.filter((r) => r.actualCents === null);

  const hasItems = allRows.length > 0;

  const sections: MonthSection[] = [];
  if (income.length) {
    sections.push({
      key: "income",
      title: "Income",
      summary: `${formatCents(view.incomeReceivedCents)} received of ${formatCents(view.incomeExpectedCents)}`,
      rows: income,
      progress: { value: view.incomeReceivedCents, max: view.incomeExpectedCents, tone: "info" },
    });
  }
  if (carried.length) {
    sections.push({
      key: "carried",
      title: `Unpaid from earlier`,
      summary: `${formatCents(view.carriedCents)} owed now`,
      rows: carried,
      tone: "danger",
      note: `Counted in the first half. If one cost nothing, record zero or choose “Nothing due this month” under More options. Only the last ${
        view.carryMonths === 1 ? "month is" : `${view.carryMonths} months are`
      } carried — change that in Settings › Bills & Income › Options.`,
    });
  }
  if (view.wholeMonth) {
    // Not divided (Pay Settings): one period for the month.
    const paid = view.halves[0].paidCents + view.halves[1].paidCents;
    const left = view.halves[0].remainingCents + view.halves[1].remainingCents;
    const budgeted = view.halves[0].budgetedCents + view.halves[1].budgetedCents;
    sections.push({ key: "half-0", title: "This Month", summary: `${formatCents(paid)} paid · ${formatCents(left)} left`, rows: [...halves[0], ...halves[1]], progress: { value: budgeted - left, max: budgeted } });
  } else view.halves.forEach((half, i) => {
    sections.push({
      key: `half-${i}`,
      title: half.half.label,
      summary: `${formatCents(half.paidCents)} paid · ${formatCents(half.remainingCents)} left`,
      rows: halves[i],
      progress: { value: half.budgetedCents - half.remainingCents, max: half.budgetedCents },
    });
  });
  if (surplus.length) {
    sections.push({
      key: "surplus",
      title: "Paid from what's left over",
      summary: `${formatCents(view.surplusPaidCents)} paid of ${formatCents(view.surplusBudgetedCents)} planned`,
      rows: surplus,
    });
  }

  const comingUp = unpaidBills
    .slice()
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 5);

  const lowDay =
    projection && !projection.balanceMissing
      ? Math.round(
          (projection.lowPoint.date.getTime() -
            Date.UTC(projection.asOf.getUTCFullYear(), projection.asOf.getUTCMonth(), projection.asOf.getUTCDate())) /
            86_400_000,
        )
      : null;

  const free = view.transferAfterSecondCents;

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <p className="tnum mt-1 text-sm text-muted">
            {view.wholeMonth ? "Whole month" : view.splitPayday ? `Split at the ${ordinal(view.splitDay)} payday` : `Split on the ${ordinal(view.splitDay)}`} ·{" "}
            {unpaidBills.length === 0
              ? "every bill settled"
              : `${unpaidBills.length} ${unpaidBills.length === 1 ? "bill" : "bills"} left · ${formatCents(
                  view.totalRemainingCents,
                )} still owed`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {review && review.count ? (
            <Link
              href="/review"
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold shadow-card transition hover:border-accent"
            >
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs text-on-accent">{review.count}</span>
              to review
            </Link>
          ) : null}
          <nav className="flex items-center rounded-xl border border-line bg-surface p-1 text-sm shadow-card" aria-label="Month">
            <Link
              href={`/month/${previous.year}/${previous.month}`}
              className="rounded-lg px-2.5 py-1.5 text-muted transition hover:bg-neutral-soft hover:text-foreground"
              aria-label={`${MONTH_NAMES[previous.month - 1]} ${previous.year}`}
            >
              ‹ {shortMonth(previous.month)}
            </Link>
            <Link
              href="/month"
              aria-current={isCurrent ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                isCurrent ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-neutral-soft hover:text-foreground"
              }`}
            >
              Today
            </Link>
            <Link
              href={`/month/${next.year}/${next.month}`}
              className="rounded-lg px-2.5 py-1.5 text-muted transition hover:bg-neutral-soft hover:text-foreground"
              aria-label={`${MONTH_NAMES[next.month - 1]} ${next.year}`}
            >
              {shortMonth(next.month)} ›
            </Link>
          </nav>
          {hasItems ? <QuickEntry rows={allRows} today={today} /> : null}
        </div>
      </header>

      {/* ------------------------------------------------ summary cards */}
      <div className={`mt-6 grid gap-4 sm:grid-cols-2 ${deckCards.length ? "xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(330px,1.25fr)]" : "xl:grid-cols-4"}`}>
        {view.billsAccountId === null ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-5 text-sm">
            <p className="font-semibold">Pick a bills account</p>
            <p className="mt-1 text-muted">
              The free-money figures start from one account&rsquo;s balance.{" "}
              <Link href="/settings/planning" className="font-semibold text-accent-text hover:underline">
                Choose it in Settings
              </Link>
            </p>
          </div>
        ) : (
          <BalanceCard
            key={`${year}-${month}-${view.billsBalanceCents}`}
            year={year}
            month={month}
            accountName={view.billsAccountName}
            balanceCents={view.billsBalanceCents}
            fromBank={billsFromBank}
            carriedFrom={
              view.billsBalanceFrom &&
              (view.billsBalanceFrom.year !== year || view.billsBalanceFrom.month !== month)
                ? view.billsBalanceFrom
                : null
            }
          />
        )}

        {view.wholeMonth ? null : <StatCard
          label="First half remaining"
          value={view.transferAfterFirstCents === null ? "—" : formatCents(view.transferAfterFirstCents)}
          tone={view.transferAfterFirstCents !== null && view.transferAfterFirstCents < 0 ? "danger" : "default"}
          detail={`${formatCents(view.halves[0].remainingCents + view.carriedCents)} still owed before the ${ordinal(view.splitDay)}${view.splitPayday ? " payday" : ""}`}
        />}

        <StatCard
          label={view.wholeMonth ? "Left this month" : "Second half remaining"}
          value={free === null ? "—" : formatCents(free)}
          tone={free !== null && free < 0 ? "danger" : "default"}
          detail={`${formatCents(view.totalRemainingCents)} still owed this month`}
        />

        {cards && deckCards.length ? (
          <CardDeck
            summary={{ totalOwedCents: cards.totalOwedCents, payThisCycleCents: cards.payThisCycleCents, nextDue: cards.nextDue }}
            cards={deckCards}
          />
        ) : (
          <StatCard
            tone="hero"
            label="Income this month"
            value={formatCents(view.incomeReceivedCents)}
            detail={`received of ${formatCents(view.incomeExpectedCents)} expected`}
          />
        )}
      </div>

      {/* ------------------------------------------------ list and rail */}
      {!hasItems ? (
        <div className="mt-6">
          <EmptyState>
            Nothing due this month.{" "}
            <Link href="/line-items?edit=new" className="font-semibold text-accent-text hover:underline">
              Add a line item
            </Link>{" "}
            and it will appear here.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <MonthList
              sections={sections}
              footer={
                plan
                  ? {
                      paidCents: plan.bills.listPaidCents,
                      budgetedCents: plan.bills.listCents,
                      also: [
                        ["Debt payment", plan.debt.cents],
                        ["Card payments", plan.bills.cardPaymentsCents],
                      ],
                    }
                  : { paidCents: paidOf(billRows), budgetedCents: budgetOf(billRows) }
              }
            />
            {cards && deckCards.length ? <CardTable cards={deckCards} /> : null}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-7">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-bold">Next {projection?.horizonDays ?? 45} days</h2>
                <Link href="/projection" className="text-xs font-semibold text-accent-text hover:underline">
                  Open
                </Link>
              </div>
              {projection && !projection.balanceMissing ? (
                <>
                  <div className="mt-3">
                    <BalanceChart
                      opening={projection.openingBalanceCents}
                      points={toChartPoints(projection.asOf, projection.days)}
                      horizonDays={projection.horizonDays}
                      lowDay={lowDay}
                    />
                  </div>
                  <p className="tnum mt-3 text-sm">
                    Low point{" "}
                    <strong className={projection.lowPoint.balanceCents < 0 ? "text-danger" : ""}>
                      {formatCents(projection.lowPoint.balanceCents)}
                    </strong>
                    <span className="text-muted">
                      {" "}
                      on {shortDate(projection.lowPoint.date.toISOString().slice(0, 10))}
                    </span>
                  </p>
                  <p className="tnum mt-0.5 text-xs text-muted">
                    Safe to send today: {formatCents(projection.safeToPayCents)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Enter the bills balance and the next weeks are drawn here.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h2 className="text-base font-bold">Coming Up</h2>
              {comingUp.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing left to pay this month.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {comingUp.map((r) => (
                    <li key={`${r.lineItemId}-${r.year}-${r.month}`} className="flex items-center gap-3 text-sm">
                      <span
                        className={`tnum w-12 shrink-0 text-xs font-semibold ${
                          r.status === "overdue" || r.status === "carried" ? "text-danger" : "text-muted"
                        }`}
                      >
                        {r.dueDate ? shortDate(r.dueDate) : "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="tnum shrink-0 text-muted">{formatCents(r.budgetedCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Welcome() {
  return (
    <div className="mx-auto max-w-2xl pt-10">
      <h1 className="text-[30px] font-bold tracking-tight">Welcome</h1>
      <p className="mt-2 max-w-prose text-muted">
        Nothing is set up yet. Add the accounts money leaves from, then your bills — or import a
        converted workbook and it creates them for you.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/settings/accounts" className={buttonClass("primary")}>
          Add accounts
        </Link>
        <Link href="/settings/data" className={buttonClass("quiet")}>
          Import a workbook
        </Link>
      </div>
    </div>
  );
}
