import { InsightsTabs } from "@/components/insights-tabs";
import Link from "next/link";
import { getInsights, getSuggestions, type CategorySpend, type MonthTotal, type Pace } from "@/server/insights";
import type { Suggestion } from "@/lib/insight-suggestions";
import { getUpcoming } from "@/server/yearly";
import { payoffTrackers, type PayoffTracker } from "@/server/card-payments";
import { getMonthView } from "@/server/month";
import { getAllowance } from "@/server/allowance";
import type { Allowance } from "@/lib/allowance";
import { ComingUpRow } from "./coming-up";
import { formatCents } from "@/lib/money";
import { Card, EmptyState, PageHeading, StatCard, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

const money = (cents: number) => formatCents(cents);
const whole = (cents: number) => formatCents(Math.round(cents / 100) * 100).replace(/\.00$/, "");
const monthLabel = (year: number, month: number, style: "long" | "short" = "long") =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: style, ...(style === "long" ? { year: "numeric" } : {}), timeZone: "UTC" });

function today() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return { year: Number(parts.find((p) => p.type === "year")?.value), month: Number(parts.find((p) => p.type === "month")?.value) };
}

function shift(year: number, month: number, by: number) {
  const n = year * 12 + month - 1 + by;
  return { year: Math.floor(n / 12), month: (n % 12) + 1 };
}

const param = (p: { year: number; month: number }) => `${p.year}-${String(p.month).padStart(2, "0")}`;

function versus(cents: number, average: number): string {
  if (!average) return "No earlier months to compare";
  const diff = cents - average;
  if (Math.abs(diff) < Math.max(1_000, average * 0.03)) return `About your ${whole(average)} average`;
  return `${whole(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than your ${whole(average)} average`;
}

/** Horizontal bars: this month's amount, with a tick at the three-month average. */
function CategoryBars({ rows, period, lastYearLabel }: { rows: CategorySpend[]; period: string; lastYearLabel: string | null }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.cents, r.averageCents)));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const href = `/insights/category/${r.id ?? "none"}?m=${period}`;
        const tip = `${r.name}: ${money(r.cents)} this month · ${money(r.averageCents)} average`;
        return (
          <li key={r.id ?? "none"}>
            <Link href={href} className="group block rounded-lg outline-offset-4" title={tip}>
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className={`truncate font-semibold group-hover:underline ${r.id ? "" : "text-muted"}`}>{r.name}</span>
                <span className="tnum shrink-0">
                  <span className="font-semibold">{money(r.cents)}</span>
                  <span className="ml-2 text-xs text-muted">avg {whole(r.averageCents)}</span>
                  {lastYearLabel && r.lastYearCents !== null ? (
                    <span className="ml-2 text-xs text-muted">
                      {lastYearLabel} {whole(r.lastYearCents)}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="relative mt-1.5 block h-2 rounded-full bg-neutral-soft">
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${r.id ? "bg-accent" : "bg-muted/50"}`}
                  style={{ width: `${(Math.max(r.cents, 0) / max) * 100}%` }}
                />
                {r.averageCents > 0 ? (
                  <span
                    aria-hidden
                    className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/70 ring-2 ring-surface"
                    style={{ left: `calc(${(r.averageCents / max) * 100}% - 1px)` }}
                  />
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Money in less money out, one bar per month around a zero line. */
function NetChart({ months, selected }: { months: MonthTotal[]; selected: number }) {
  const max = Math.max(1, ...months.map((m) => Math.abs(m.netCents)));
  const anyNegative = months.some((m) => m.netCents < 0);
  const anyPositive = months.some((m) => m.netCents > 0);
  // Share of the plot above the zero line.
  const above = anyNegative && anyPositive ? 0.5 : anyNegative ? 0 : 1;
  return (
    <div role="img" aria-label="Money in less money out by month">
      <div className="relative flex h-40 items-stretch gap-2">
        <span aria-hidden className="absolute inset-x-0 border-t border-line" style={{ top: `${above * 100}%` }} />
        {months.map((m) => {
          const share = (Math.abs(m.netCents) / max) * (anyNegative && anyPositive ? 0.5 : 1);
          const isSelected = m.year * 12 + m.month === selected;
          const tip = `${monthLabel(m.year, m.month)}: ${money(m.inCents)} in, ${money(m.everydayCents + m.billsCents)} out, ${money(m.netCents)} net`;
          return (
            <div key={`${m.year}-${m.month}`} title={tip} className="group relative flex-1">
              <span
                className="absolute left-1/2 w-full max-w-11 -translate-x-1/2 transition-opacity group-hover:opacity-100"
                style={{
                  background: m.netCents >= 0 ? "var(--accent)" : "var(--chart-negative)",
                  opacity: isSelected ? 1 : 0.55,
                  height: `max(${share * 100}%, ${m.netCents ? 2 : 0}px)`,
                  ...(m.netCents >= 0
                    ? { bottom: `${(1 - above) * 100}%`, borderRadius: "4px 4px 0 0" }
                    : { top: `${above * 100}%`, borderRadius: "0 0 4px 4px" }),
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 text-center">
        {months.map((m) => {
          const isSelected = m.year * 12 + m.month === selected;
          return (
            <div key={`${m.year}-${m.month}`} className="flex-1">
              <span className={`block text-xs ${isSelected ? "font-semibold text-foreground" : "text-muted"}`}>{monthLabel(m.year, m.month, "short")}</span>
              <span className="tnum block text-[11px] text-muted">{whole(m.netCents)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MARK: Record<Suggestion["kind"], { glyph: string; tone: string }> = {
  rising: { glyph: "▲", tone: "text-warn" },
  spike: { glyph: "◆", tone: "text-warn" },
  interest: { glyph: "%", tone: "text-danger" },
  fees: { glyph: "!", tone: "text-danger" },
  trim: { glyph: "✂", tone: "text-accent-text" },
  repeating: { glyph: "↻", tone: "text-accent-text" },
  "new-repeat": { glyph: "+", tone: "text-warn" },
  "price-up": { glyph: "↑", tone: "text-warn" },
  payoff: { glyph: "◎", tone: "text-ok" },
};

/** The big picture: what everyday spending can be each month, against what it has been. */
function LimitCard({ a }: { a: Allowance }) {
  const t = a.thisMonth;
  const scale = Math.max(a.limitCents, t.projectedCents ?? 0, t.spentCents, 1);
  const pct = (cents: number) => `${Math.min(100, (Math.max(0, cents) / scale) * 100).toFixed(1)}%`;
  const over = a.overCents > 0;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Spending limit</h2>
        <span className="text-xs text-muted">Everyday spending, cards and debit together</span>
      </div>
      {a.limitCents > 0 ? (
        <p className="mt-2 text-sm">
          To stay within your plan, keep everyday spending to about{" "}
          <span className="tnum text-xl font-extrabold">{whole(a.limitCents)}</span> a month.
        </p>
      ) : (
        <p className="mt-2 text-sm font-semibold text-danger">
          The bills and 0% payoff in the plan already take more than its income, so nothing is left for everyday spending.
        </p>
      )}
      <p className="tnum mt-1 text-xs text-muted">
        {whole(a.incomeCents)} income{a.incomeSource === "bank" ? " (recent deposits: the plan has no income items)" : ""} − {whole(a.fixedBillsCents)} bills
        {a.payoffCents ? ` − ${whole(a.payoffCents)} 0% payoff` : ""} = {whole(a.limitCents)}, averaged over the next 12 months
      </p>

      {a.averageCents > 0 ? (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${over ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>
          {over ? (
            <>
              The last three months averaged <span className="font-bold">{whole(a.averageCents)}</span>: about{" "}
              <span className="font-bold">{whole(a.overCents)} a month over</span> ({whole(a.overCents * 12)} a year).
            </>
          ) : (
            <>
              The last three months averaged <span className="font-bold">{whole(a.averageCents)}</span>, about {whole(-a.overCents)} a month under.
            </>
          )}
          {a.averageOnCardsCents > 0 ? ` ${whole(a.averageOnCardsCents)} of it went on cards.` : ""}
        </p>
      ) : null}

      <div className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            This month: <span className="tnum font-bold">{whole(t.spentCents)}</span> of {whole(a.limitCents)}
          </span>
          <span className={`tnum font-semibold ${t.leftCents < 0 ? "text-danger" : ""}`}>
            {t.leftCents >= 0 ? `${whole(t.leftCents)} left · about ${whole(t.perWeekLeftCents)} a week for the next ${t.daysLeft} days` : `${whole(-t.leftCents)} over already`}
          </span>
        </div>
        <div className="relative mt-2 h-3 rounded-full bg-neutral-soft" role="img" aria-label={`Spent ${whole(t.spentCents)} of a ${whole(a.limitCents)} limit`}>
          {t.projectedCents ? <div className="absolute inset-y-0 left-0 rounded-full bg-accent/25" style={{ width: pct(t.projectedCents) }} /> : null}
          <div className={`absolute inset-y-0 left-0 rounded-full ${t.spentCents > a.limitCents ? "bg-danger" : "bg-accent"}`} style={{ width: pct(t.spentCents) }} />
          <div className="absolute -top-1 h-5 w-0.5 bg-foreground" style={{ left: pct(a.limitCents) }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          The line is the limit{t.projectedCents ? `; at your usual pace the month ends near ${whole(t.projectedCents)}` : ""}.
        </p>
      </div>
      {a.cardPaymentNames.length ? (
        <p className="mt-3 text-xs text-muted">
          Card payments ({a.cardPaymentNames.join(", ")}) aren&rsquo;t counted as bills here: they pay for this spending. If one of
          these isn&rsquo;t a card payment, set &ldquo;Pays a card&rdquo; to &ldquo;Not a card payment&rdquo; on it in Bills &amp; income.
        </p>
      ) : null}
    </Card>
  );
}

const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Each 0% balance: how much is paid down, and whether the payments keep it on schedule. */
function PayoffCard({ rows }: { rows: PayoffTracker[] }) {
  return (
    <Card>
      <h2 className="text-base font-bold">0% payoff</h2>
      <ul className="mt-3 space-y-5">
        {rows.map((r) => {
          const share = r.startCents ? Math.min(1, (r.paidCents ?? 0) / r.startCents) : null;
          return (
            <li key={r.id} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{r.name}</span>
                <span className={`text-xs font-semibold ${r.onTrack ? "text-ok" : "text-warn"}`}>{r.onTrack ? "On track" : "Behind plan"}</span>
              </div>
              {share !== null ? (
                <div className="relative mt-2 h-3 rounded-full bg-neutral-soft" role="img" aria-label={`${Math.round(share * 100)}% paid down`}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-ok" style={{ width: `${share * 100}%` }} />
                </div>
              ) : null}
              <p className="mt-2 text-xs text-muted">
                {r.startCents !== null ? (
                  <>
                    <span className="font-semibold text-foreground">{whole(r.paidCents ?? 0)}</span> of {whole(r.startCents)} paid down ·{" "}
                  </>
                ) : null}
                {whole(r.balanceCents)} left · {r.paymentsLeft} payment{r.paymentsLeft === 1 ? "" : "s"} of {whole(r.monthlyCents)} clear it by {longDate(r.endsOn)}
                {!r.onTrack && r.planMonthlyCents ? ` (the plan was ${whole(r.planMonthlyCents)} a month)` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Everyday spending by month; the month in progress shows what's still to come at a usual pace. */
function EverydayChart({ months, selected, pace }: { months: MonthTotal[]; selected: number; pace: Pace | null }) {
  const last = months[months.length - 1];
  const rest = pace ? Math.max(0, pace.projectedCents - pace.soFarCents) : 0;
  const max = Math.max(1, ...months.map((m) => m.everydayCents + (m === last ? rest : 0)));
  return (
    <div role="img" aria-label="Everyday spending by month">
      <div className="flex h-40 items-end gap-2">
        {months.map((m) => {
          const isSelected = m.year * 12 + m.month === selected;
          const extra = m === last ? rest : 0;
          return (
            <div key={`${m.year}-${m.month}`} className="flex h-full flex-1 flex-col justify-end" title={`${monthLabel(m.year, m.month)}: ${money(m.everydayCents)}${extra ? `, about ${whole(extra)} more to come` : ""}`}>
              {extra ? <span className="mx-auto w-full max-w-11 rounded-t border border-dashed border-accent/60 bg-accent/10" style={{ height: `${(extra / max) * 100}%` }} /> : null}
              <span
                className={`mx-auto w-full max-w-11 ${extra ? "" : "rounded-t"} bg-accent`}
                style={{ height: `max(${(m.everydayCents / max) * 100}%, ${m.everydayCents ? 2 : 0}px)`, opacity: isSelected ? 1 : 0.55 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 text-center">
        {months.map((m) => {
          const isSelected = m.year * 12 + m.month === selected;
          return (
            <div key={`${m.year}-${m.month}`} className="flex-1">
              <span className={`block text-xs ${isSelected ? "font-semibold text-foreground" : "text-muted"}`}>{monthLabel(m.year, m.month, "short")}</span>
              <span className="tnum block text-[11px] text-muted">{whole(m.everydayCents)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The month in progress against a usual month by the same day. */
function PaceCard({ pace, leftAfterBillsCents, weekCents }: { pace: Pace; leftAfterBillsCents: number | null; weekCents: number | null }) {
  const scale = Math.max(pace.projectedCents, pace.usualMonthCents, 1);
  const pct = (cents: number) => `${Math.min(100, (cents / scale) * 100).toFixed(1)}%`;
  const diff = pace.projectedCents - pace.usualMonthCents;
  const close = Math.abs(diff) < Math.max(2_500, pace.usualMonthCents * 0.03);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Pace</h2>
        <span className="text-xs text-muted">
          Day {pace.day} of {pace.daysInMonth} · everyday spending
        </span>
      </div>
      <p className="mt-2 text-sm">
        On pace for <span className="tnum font-bold">{whole(pace.projectedCents)}</span>
        {close ? ", about the same as a usual month." : diff > 0 ? `, about ${whole(diff)} more than a usual month.` : `, about ${whole(-diff)} less than a usual month.`}
      </p>
      <div className="relative mt-3 h-3 rounded-full bg-neutral-soft" role="img" aria-label={`Spent ${whole(pace.soFarCents)} so far; a usual month has spent ${whole(pace.usualByNowCents)} by now and ${whole(pace.usualMonthCents)} in all.`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: pct(pace.soFarCents) }} />
        <div className="absolute inset-y-0 rounded-full bg-accent/25" style={{ left: pct(pace.soFarCents), width: `calc(${pct(pace.projectedCents)} - ${pct(pace.soFarCents)})` }} />
        <div className="absolute -top-1 h-5 w-0.5 bg-foreground" style={{ left: pct(pace.usualByNowCents) }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>
          <span className="font-semibold text-foreground">{whole(pace.soFarCents)}</span> so far · a usual month is at {whole(pace.usualByNowCents)} by now (the line)
        </span>
        <span>Usual month {whole(pace.usualMonthCents)}</span>
      </div>
      <div className="mt-4 grid gap-3 border-t border-line pt-3 text-sm sm:grid-cols-3">
        {leftAfterBillsCents !== null ? (
          <p>
            <span className="block text-xs text-muted">Left after this month&rsquo;s bills</span>
            <span className={`tnum font-bold ${leftAfterBillsCents < 0 ? "text-danger" : ""}`}>{whole(leftAfterBillsCents)}</span>
            <span className="block text-xs text-muted">in the bills account, once bills and paychecks land</span>
          </p>
        ) : null}
        <p>
          <span className="block text-xs text-muted">Still to come this month</span>
          <span className="tnum font-bold">{whole(pace.projectedCents - pace.soFarCents)}</span>
          <span className="block text-xs text-muted">
            everyday spending at a usual pace{pace.restOnCardsCents > 0 ? `, about ${whole(pace.restOnCardsCents)} of it on cards (paid next month)` : ""}
          </span>
        </p>
        {weekCents !== null ? (
          <p>
            <span className="block text-xs text-muted">Last 7 days</span>
            <span className="tnum font-bold">{whole(weekCents)}</span>
            <span className="block text-xs text-muted">everyday spending</span>
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** What was actually spent each month, as small labeled bars. */
function MiniMonths({ months }: { months: Array<{ label: string; cents: number }> }) {
  const max = Math.max(1, ...months.map((m) => m.cents));
  return (
    <span className="mt-2 flex items-end gap-1.5" role="img" aria-label={months.map((m) => `${m.label} ${whole(m.cents)}`).join(", ")}>
      {months.map((m, i) => (
        <span key={`${m.label}-${i}`} className="flex w-9 flex-col items-center gap-0.5">
          <span className="tnum text-[10px] text-muted">{whole(m.cents)}</span>
          <span className="flex h-8 w-full items-end">
            <span className={`w-full rounded-t ${i >= months.length - 3 ? "bg-accent" : "bg-accent/35"}`} style={{ height: `max(${(m.cents / max) * 100}%, ${m.cents ? 2 : 0}px)` }} />
          </span>
          <span className="text-[10px] text-muted">{m.label}</span>
        </span>
      ))}
    </span>
  );
}

function Suggestions({ items }: { items: Suggestion[] }) {
  const keep = items.reduce((s, x) => s + x.monthlyCents, 0);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Suggestions</h2>
        <span className="text-xs text-muted">
          From the last six complete months
          {keep > 0 ? (
            <>
              {" "}· together, up to <span className="font-semibold text-foreground">{whole(keep)}</span> a month
            </>
          ) : null}
        </span>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((x) => (
          <li key={`${x.kind}-${x.categoryId ?? x.title}`} className="flex gap-3 rounded-xl border border-line p-3 text-sm">
            <span aria-hidden className={`w-4 shrink-0 text-center font-bold ${MARK[x.kind].tone}`}>
              {MARK[x.kind].glyph}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{x.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{x.detail}</span>
              {x.months?.length ? <MiniMonths months={x.months} /> : null}
              {x.items?.length ? (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {x.items.map((i) => (
                    <span key={i.name} className="rounded-md bg-neutral-soft px-2 py-0.5 text-xs">
                      {i.name}{" "}
                      <span className="tnum text-muted">
                        {i.fromCents !== undefined ? `${money(i.fromCents)} → ` : ""}
                        {money(i.cents)}
                      </span>
                    </span>
                  ))}
                </span>
              ) : null}
              {x.categoryId ? (
                <Link href={`/insights/category/${x.categoryId}`} className="mt-1.5 inline-block text-xs font-semibold text-accent-text hover:underline">
                  See the charges
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const now = today();
  const match = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  const asked = match ? { year: Number(match[1]), month: Number(match[2]) } : now;
  const picked = asked.month >= 1 && asked.month <= 12 && asked.year * 12 + asked.month <= now.year * 12 + now.month ? asked : now;
  const isNow = picked.year === now.year && picked.month === now.month;
  const [data, suggestions, upcoming, payoff, view] = await Promise.all([
    getInsights(picked.year, picked.month),
    getSuggestions(),
    getUpcoming(),
    payoffTrackers(),
    isNow ? getMonthView(picked.year, picked.month).catch(() => null) : Promise.resolve(null),
  ]);
  const limit = isNow ? await getAllowance().catch(() => null) : null;
  const prev = shift(picked.year, picked.month, -1);
  const next = shift(picked.year, picked.month, 1);
  const atNow = picked.year === now.year && picked.month === now.month;
  const { current } = data;
  // Months before the bank history starts aren't $0 months; leave them off the charts.
  const firstShown = Math.max(0, data.months.findIndex((x) => x.everydayCents || x.billsCents || x.inCents));
  const chartMonths = data.months.slice(firstShown);
  const twelveIn = data.months.reduce((s, x) => s + x.netCents, 0);

  return (
    <div className="space-y-6">
      <InsightsTabs active="spending" />
      <PageHeading
        title="Insights"
        description="Where the money went, from the bank feed. Transfers between your accounts and money managed for others are left out."
        action={
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 text-sm">
            <Link href={`/insights?m=${param(prev)}`} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
              ‹ {monthLabel(prev.year, prev.month, "short")}
            </Link>
            <span className="px-2.5 py-1 font-semibold">{monthLabel(picked.year, picked.month)}</span>
            {atNow ? (
              <span className="px-2.5 py-1 text-muted/50">{monthLabel(next.year, next.month, "short")} ›</span>
            ) : (
              <Link href={`/insights?m=${param(next)}`} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
                {monthLabel(next.year, next.month, "short")} ›
              </Link>
            )}
          </div>
        }
      />

      {!data.hasData ? (
        <EmptyState>
          Nothing from the bank for these months yet. Connect bank sync in{" "}
          <Link href="/settings/bank" className="font-semibold text-accent-text hover:underline">
            Settings → Bank sync
          </Link>{" "}
          or import older history from a file.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Everyday spending"
              value={money(current.everydayCents)}
              detail={`${versus(current.everydayCents, data.everydayAverageCents)}${data.lastYear ? ` · ${whole(data.lastYear.everydayCents)} in ${monthLabel(picked.year - 1, picked.month, "short")} ${picked.year - 1}` : ""}`}
              tone="hero"
            />
            <StatCard label="Bills paid" value={money(current.billsCents)} detail="Charges confirmed as bill payments" />
            <StatCard label="Money in" value={money(current.inCents)} detail="Deposits to checking and savings" />
            <StatCard
              label="In minus out"
              value={money(current.netCents)}
              detail={atNow ? "So far this month" : "For the month"}
              tone={current.netCents < 0 ? "danger" : "default"}
            />
          </div>

          {limit ? <LimitCard a={limit} /> : null}
          {data.pace ? <PaceCard pace={data.pace} leftAfterBillsCents={view?.transferAfterSecondCents ?? null} weekCents={data.weekCents} /> : null}
          {payoff.length ? <PayoffCard rows={payoff} /> : null}
          {upcoming.length ? (
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold">Coming up</h2>
                <span className="text-xs text-muted">Yearly charges due in the next 45 days, from bank history</span>
              </div>
              <ul className="mt-1 divide-y divide-line text-sm">
                {upcoming.map((u) => (
                  <ComingUpRow key={u.key} item={{ key: u.key, merchant: u.merchant, expectedOn: u.expectedOn, cents: u.cents, lastOn: u.lastOn, years: u.years }} />
                ))}
              </ul>
            </Card>
          ) : null}
          {suggestions.length ? <Suggestions items={suggestions} /> : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold">Where it went</h2>
                <span className="text-xs text-muted">Everyday spending · tick marks the 3-month average · tap one for its charges</span>
              </div>
              {data.categories.length ? (
                <CategoryBars rows={data.categories} period={param(picked)} lastYearLabel={data.lastYear ? monthLabel(picked.year - 1, picked.month, "short") + " '" + String(picked.year - 1).slice(2) : null} />
              ) : (
                <p className="text-sm text-muted">No everyday spending this month.</p>
              )}
              {data.uncategorized.count ? (
                <p className="mt-4 rounded-lg bg-neutral-soft px-3 py-2 text-xs text-muted">
                  {data.uncategorized.count} charge{data.uncategorized.count === 1 ? "" : "s"} ({money(data.uncategorized.cents)}) without a category.{" "}
                  <Link href="/transactions?category=none" className="font-semibold text-accent-text hover:underline">
                    Sort them
                  </Link>{" "}
                  — setting one for a merchant covers the rest from it.
                </p>
              ) : null}
            </Card>

            <div className="space-y-6">
              <Card>
                <h2 className="text-base font-bold">What changed</h2>
                {data.changes.length ? (
                  <ul className="mt-3 space-y-3 text-sm">
                    {data.changes.map((c) => {
                      const up = c.cents > c.averageCents;
                      return (
                        <li key={c.id ?? "none"} className="flex gap-3">
                          <span aria-hidden className={`mt-0.5 font-bold ${up ? "text-warn" : "text-ok"}`}>
                            {up ? "▲" : "▼"}
                          </span>
                          <span>
                            <span className="font-semibold">{c.name}</span> {up ? "up" : "down"} {whole(Math.abs(c.cents - c.averageCents))}
                            <span className="block text-xs text-muted">
                              {money(c.cents)} against a {whole(c.averageCents)} average
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">Nothing stands out against the last three months.</p>
                )}
              </Card>

              <Card>
                <h2 className="text-base font-bold">Top merchants</h2>
                {data.merchants.length ? (
                  <ol className="mt-3 divide-y divide-line text-sm">
                    {data.merchants.map((x) => (
                      <li key={x.merchant} className="flex items-baseline justify-between gap-3 py-2">
                        <span className="min-w-0 truncate">
                          {x.merchant}
                          {x.count > 1 ? <span className="ml-1.5 text-xs text-muted">×{x.count}</span> : null}
                        </span>
                        <span className="tnum shrink-0 font-semibold">{money(x.cents)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-muted">No everyday spending this month.</p>
                )}
              </Card>
            </div>
          </div>

          <Card>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">Everyday spending, by month</h2>
              <span className="text-xs text-muted">The dashed part is what a usual month still spends from here</span>
            </div>
            <EverydayChart months={chartMonths} selected={picked.year * 12 + picked.month} pace={data.pace} />
          </Card>

          <Card>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">In minus out, by month</h2>
              <span className="text-xs text-muted">
                Over these {chartMonths.length} months, money {twelveIn >= 0 ? "in ran" : "out ran"}{" "}
                <span className="font-semibold text-foreground">{whole(Math.abs(twelveIn))}</span> ahead
              </span>
            </div>
            <NetChart months={chartMonths} selected={picked.year * 12 + picked.month} />
          </Card>
        </>
      )}

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Managed for others</h2>
          <Link href="/settings/categories" className="text-xs font-semibold text-accent-text hover:underline">
            Categories
          </Link>
        </div>
        {data.managed.length ? (
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.managed.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <Link href={`/transactions?category=${x.id}`} className="font-semibold hover:underline">
                    {x.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    This month: {money(x.monthInCents)} collected · {money(x.monthOutCents)} paid out
                  </span>
                </span>
                <span className="text-right">
                  <span className="tnum block font-bold">{money(Math.abs(x.heldCents))}</span>
                  <span className="text-xs text-muted">{x.heldCents >= 0 ? "held for others" : "fronted by you"}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Money you collect and pass on, like league fees, can be kept out of your spending and income. Mark its category as
            managed for others in Settings → Categories, then set that category on those transactions.
          </p>
        )}
      </Card>
      <p className="text-xs text-muted">
        <Link href="/transactions" className={buttonClass("quiet")}>
          All transactions
        </Link>
      </p>
    </div>
  );
}
