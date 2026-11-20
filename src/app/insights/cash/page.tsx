/**
 * Cash: checking day by day through the end of next month, in the worst or best case. Four figures,
 * a chart with both cases, then what each paycheck pays, or the same as one running list.
 */

import { InsightsTabs } from "@/components/insights-tabs";
import { checkingHistory } from "@/server/checking-history";
import { SlidingChart, type SlideStep } from "./sliding-chart";
import { pastForecasts, type PastForecast } from "@/server/cash-cases";
import { Card } from "@/components/ui";
import type { CashTimingView } from "@/server/cash-timing";
import type { CashStep } from "@/lib/cash-timing";
import { TabHeading } from "../shared";
import { type Case, MissingChecking, Switch, day, exact, loadCash, money, signed } from "./parts";

export const dynamic = "force-dynamic";

const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

const tag = (s: CashStep) =>
  s.kind === "card" ? (s.label.startsWith("Budgets left") ? "worst case" : `card, in full${s.estimate ? " (so far)" : ""}`) : s.kind === "debt" ? "0% payment" : "";

function Columns({ cash }: { cash: CashTimingView }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cash.spans.map((sp, i) => (
        <Card key={sp.from} className="flex flex-col !p-4">
          <p className="text-sm font-bold">{i === 0 && sp.payCents === 0 ? `Now – ${day(sp.to)}` : `${day(sp.from)} paycheck`}</p>
          <p className="tnum text-xs text-muted">
            {sp.payCents ? `${money(sp.payCents)} in · ` : ""}
            {money(sp.outCents)} out
          </p>
          {sp.items.length ? (
            <ul className="mt-1.5 divide-y divide-line text-sm">
              {sp.items.map((s, k) => (
                <li key={`${s.date}:${s.label}:${k}`} className="flex items-baseline justify-between gap-2 py-1">
                  <span className="min-w-0 truncate">
                    <span className="tnum text-xs text-muted">{day(s.date)}</span> {s.label}
                    {s.overdue ? <span className="ml-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">Overdue</span> : null}
                  </span>
                  <span className="tnum shrink-0">{money(-s.cents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-muted">Nothing due.</p>
          )}
          <p className={`mt-auto flex justify-between border-t border-line pt-2 text-sm font-bold ${sp.endCents < 0 ? "text-danger" : ""}`}>
            <span>Left</span>
            <span className="tnum">{money(sp.endCents)}</span>
          </p>
        </Card>
      ))}
    </div>
  );
}

function Register({ cash }: { cash: CashTimingView }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="pb-2 font-semibold">Date</th>
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 text-right font-semibold">In</th>
              <th className="pb-2 text-right font-semibold">Out</th>
              <th className="pb-2 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <td className="tnum py-1.5 text-muted">{day((cash.balanceAsOf ?? cash.today).slice(0, 10))}</td>
              <td className="font-semibold">Checking balance</td>
              <td />
              <td />
              <td className="tnum text-right font-bold">{exact(cash.startCents)}</td>
            </tr>
            {cash.steps.map((s, i) => (
              <tr key={`${s.date}:${s.label}:${i}`} className={`border-t ${s.kind === "pay" ? "border-line-strong" : "border-line"}`}>
                <td className="tnum py-1.5 text-muted">{day(s.date)}</td>
                <td className={s.kind === "pay" ? "font-semibold text-ok" : ""}>
                  {s.label} {tag(s) ? <span className="text-xs text-muted">{tag(s)}</span> : null}
                  {s.overdue ? <span className="ml-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">Overdue</span> : null}
                </td>
                <td className="tnum text-right text-ok">{s.cents > 0 ? exact(s.cents) : ""}</td>
                <td className="tnum text-right">{s.cents < 0 ? exact(-s.cents) : ""}</td>
                <td className={`tnum text-right font-semibold ${s.balanceCents < 0 ? "text-danger" : ""}`}>{exact(s.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function CashPage({ searchParams }: { searchParams: Promise<{ case?: string; show?: string }> }) {
  const q = await searchParams;
  const mode: Case = q.case === "best" ? "best" : "worst";
  const show = q.show === "list" ? "list" : "chart";
  const data = await loadCash();
  // About six months of history for the chart to slide back through.
  const today = data?.best.today ?? new Date().toISOString().slice(0, 10);
  const first = new Date(at(today) - 182 * 86_400_000).toISOString().slice(0, 10);
  const [past, then] = data && !data.best.missing ? await Promise.all([checkingHistory(first, today), pastForecasts(first, today)]) : [null, new Map<string, PastForecast>()];
  const href = (next: { case?: string; show?: string }) => {
    const c = next.case ?? mode, s = next.show ?? show;
    const p = [c === "best" ? "case=best" : "", s === "list" ? "show=list" : ""].filter(Boolean).join("&");
    return `/insights/cash${p ? `?${p}` : ""}`;
  };
  const toSteps = (c: CashTimingView): SlideStep[] => c.steps.map((s) => ({ date: s.date, cents: s.balanceCents, pay: s.kind === "pay", label: s.label, amount: s.cents }));
  const cash = data ? (mode === "worst" ? data.worst : data.best) : null;
  const nextPay = cash?.steps.find((s) => s.kind === "pay");
  const tiles: Array<[string, string, string]> = cash
    ? [
        [`Checking now${cash.balanceAsOf ? ` · ${day(cash.balanceAsOf.slice(0, 10))}` : ""}`, money(cash.startCents), ""],
        [`Lowest · ${day(cash.lowOn)}`, money(cash.lowCents), cash.lowCents < 0 ? "text-danger" : ""],
        [nextPay ? `Next payday · ${day(nextPay.date)}` : "Next payday", nextPay ? signed(nextPay.cents) : "—", "text-ok"],
        [`On ${day(cash.until)}`, money(cash.steps.at(-1)?.balanceCents ?? cash.startCents), (cash.steps.at(-1)?.balanceCents ?? cash.startCents) < 0 ? "text-danger" : ""],
      ]
    : [];

  return (
    <div className="space-y-4">
      <InsightsTabs
        right={
          <Switch
            options={[
              ["worst", "Worst case"],
              ["best", "Best case"],
            ]}
            on={mode}
            href={(v) => href({ case: v })}
          />
        }
      />
      <TabHeading title="Cash" />
      {!data || !cash || cash.missing ? (
        <Card>
          <MissingChecking />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {tiles.map(([label, value, cls]) => (
              <Card key={label} className="!px-4 !py-3">
                <p className="text-xs text-muted">{label}</p>
                <p className={`tnum text-2xl font-bold ${cls}`}>{value}</p>
              </Card>
            ))}
          </div>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold">Checking, Day by Day</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-0.5 w-4 bg-[var(--series-1)]" />
                  Best case: charged so far
                </span>
                {data.budgetLeftCents > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-[var(--series-2)]" />
                    Worst case: budgets used ({money(data.budgetLeftCents)})
                  </span>
                ) : null}
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-[var(--ok)]" />
                  Payday
                </span>
                <Switch
                  options={[
                    ["chart", "Paychecks"],
                    ["list", "List"],
                  ]}
                  on={show}
                  href={(v) => href({ show: v })}
                />
              </div>
            </div>
            <SlidingChart
              first={first}
              today={today}
              until={data.best.until}
              startCents={data.best.startCents}
              past={(past?.days ?? []).map((d) => ({ date: d.date, cents: d.balanceCents }))}
              then={[...then].filter(([d]) => d < today).sort((x, y) => x[0].localeCompare(y[0])).map(([date, f]) => ({ date, cents: mode === "worst" ? f.worstCents : f.bestCents }))}
              best={toSteps(data.best)}
              worst={toSteps(data.worst)}
              mode={mode}
            />
            {cash.cardsWithoutDays > 0 ? (
              <p className="mt-1 text-xs text-warn">
                {cash.cardsWithoutDays} card{cash.cardsWithoutDays === 1 ? " has" : "s have"} no statement and due days, so {cash.cardsWithoutDays === 1 ? "its payment isn't" : "their payments aren't"} here: set them on Accounts.
              </p>
            ) : null}
          </Card>
          {show === "list" ? <Register cash={cash} /> : <Columns cash={cash} />}
        </>
      )}
    </div>
  );
}
