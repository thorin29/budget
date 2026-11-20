/**
 * Cash: checking day by day through the end of next month, in the worst or best case. Four figures,
 * a chart with both cases, then what each paycheck pays, or the same as one running list.
 */

import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { checkingHistory, type PastDay } from "@/server/checking-history";
import { pastForecasts, type PastForecast } from "@/server/cash-cases";
import { Card } from "@/components/ui";
import type { CashTimingView } from "@/server/cash-timing";
import type { CashStep } from "@/lib/cash-timing";
import { TabHeading } from "../shared";
import { type Case, MissingChecking, Switch, day, exact, loadCash, money, signed } from "./parts";

export const dynamic = "force-dynamic";

const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

function niceStep(span: number) {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  return ([1, 2, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
}

/**
 * Checking over the window: what it actually held before today (solid, dark), the forecast made a
 * week before each of those days (dotted), then both cases ahead (best solid, worst dashed).
 */
function Chart({ from, end, best, worst, mode, past, then }: { from: string; end: string; best: CashTimingView; worst: CashTimingView; mode: Case; past: PastDay[]; then: Map<string, PastForecast> }) {
  const W = 1200, H = 290, L = 60, R = 12, T = 14, B = 28;
  const t0 = at(from), t1 = at(end);
  const ahead = (c: CashTimingView) => c.steps.filter((s) => s.date <= end);
  const thenVals = past.map((d) => then.get(d.date)).filter((f): f is PastForecast => !!f).map((f) => (mode === "worst" ? f.worstCents : f.bestCents));
  const showAhead = best.today <= end;
  const all = [...past.map((d) => d.balanceCents), ...thenVals, ...(showAhead ? [best.startCents, ...ahead(best).map((s) => s.balanceCents), ...ahead(worst).map((s) => s.balanceCents)] : [])];
  const step = niceStep((Math.max(0, ...all) - Math.min(0, ...all)) / 100) * 100;
  const hi = Math.ceil(Math.max(0, ...all) / step) * step || step;
  const lo = Math.floor(Math.min(0, ...all) / step) * step;
  const x = (iso: string) => L + ((at(iso) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (c: number) => T + ((hi - c) / Math.max(1, hi - lo)) * (H - T - B);
  const path = (c: CashTimingView) => {
    let d = `M${x(c.today)} ${y(c.startCents)}`;
    for (const s of ahead(c)) d += `H${x(s.date)}V${y(s.balanceCents)}`;
    return `${d}H${x(end)}`;
  };
  // Past days: a step at the start of each day to its closing balance.
  const pastPath = past.length ? past.reduce((d, p, i) => `${d}${i ? `H${x(p.date)}` : ""}V${y(p.balanceCents)}`, `M${x(past[0].date)} ${y(past[0].balanceCents)}`) + `H${x(best.today)}` : "";
  const thenPts = past.map((d) => [d.date, then.get(d.date)] as const).filter((p): p is readonly [string, PastForecast] => !!p[1]);
  const thenPath = thenPts.length ? thenPts.map(([d, f], i) => `${i ? "L" : "M"}${x(d)} ${y(mode === "worst" ? f.worstCents : f.bestCents)}`).join("") : "";
  const sel = mode === "worst" ? worst : best;
  const grid: number[] = [];
  for (let v = lo; v <= hi; v += step) grid.push(v);
  const weeks: string[] = [];
  for (let t = t0; t <= t1; t += 7 * 86_400_000) weeks.push(new Date(t).toISOString().slice(0, 10));
  const lowOn = sel.lowOn <= end ? sel.lowOn : null;
  const pastLow = past.length ? past.reduce((l, d) => (d.balanceCents < l.balanceCents ? d : l)) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`Checking from ${day(from)} to ${day(end)}`}>
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={v === 0 ? "4 4" : undefined} />
          <text x={L - 8} y={y(v) + 4} fontSize="12" textAnchor="end" className="fill-muted">
            {money(v)}
          </text>
        </g>
      ))}
      {showAhead && best.today >= from ? (
        <g>
          <line x1={x(best.today)} x2={x(best.today)} y1={T} y2={H - B} stroke="var(--foreground)" strokeOpacity="0.35" />
          <text x={x(best.today) + 4} y={T + 10} fontSize="11" className="fill-muted">
            Today
          </text>
        </g>
      ) : null}
      {thenPath ? <path d={thenPath} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="2 4" /> : null}
      {pastPath ? <path d={pastPath} fill="none" stroke="var(--foreground)" strokeWidth="2.5" /> : null}
      {showAhead ? (
        <>
          <path d={`${path(best)}V${y(Math.max(lo, 0))}H${x(best.today)}Z`} fill="var(--series-1)" fillOpacity="0.08" />
          <path d={path(best)} fill="none" stroke="var(--series-1)" strokeWidth={mode === "best" ? 3 : 2} />
          {worst !== best ? <path d={path(worst)} fill="none" stroke="var(--series-2)" strokeWidth={mode === "worst" ? 2.5 : 1.75} strokeDasharray="7 5" /> : null}
          {ahead(sel)
            .filter((s) => s.kind === "pay")
            .map((s) => (
              <circle key={`${s.date}${s.label}`} cx={x(s.date)} cy={y(s.balanceCents)} r="4.5" fill="var(--ok)">
                <title>{`${s.label} ${day(s.date)}: ${signed(s.cents)}`}</title>
              </circle>
            ))}
        </>
      ) : null}
      {pastLow ? (
        <g>
          <circle cx={x(pastLow.date)} cy={y(pastLow.balanceCents)} r="4.5" fill={pastLow.balanceCents < 0 ? "var(--danger)" : "var(--foreground)"} />
          <text x={Math.min(W - 230, x(pastLow.date) + 8)} y={Math.min(H - B - 6, y(pastLow.balanceCents) + 16)} fontSize="12" className="fill-muted">
            Actual low {money(pastLow.balanceCents)} · {day(pastLow.date)}
          </text>
        </g>
      ) : null}
      {showAhead && lowOn ? (
        <g>
          <circle cx={x(lowOn)} cy={y(sel.lowCents)} r="5.5" fill={sel.lowCents < 0 ? "var(--danger)" : "var(--foreground)"} stroke="var(--surface)" strokeWidth="2" />
          <text x={Math.min(W - 200, x(lowOn) + 10)} y={Math.min(H - B - 6, y(sel.lowCents) + 18)} fontSize="13" fontWeight="700" className={sel.lowCents < 0 ? "fill-danger" : "fill-foreground"}>
            Lowest ahead {money(sel.lowCents)} · {day(lowOn)}
          </text>
        </g>
      ) : null}
      {weeks.map((w) => (
        <text key={w} x={x(w)} y={H - 8} fontSize="12" textAnchor="middle" className="fill-muted">
          {day(w)}
        </text>
      ))}
    </svg>
  );
}

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

export default async function CashPage({ searchParams }: { searchParams: Promise<{ case?: string; show?: string; from?: string }> }) {
  const q = await searchParams;
  const mode: Case = q.case === "best" ? "best" : "worst";
  const show = q.show === "list" ? "list" : "chart";
  const data = await loadCash();
  // The chart's 60-day window: two weeks back by default, moved a month at a time.
  const today = data?.best.today ?? new Date().toISOString().slice(0, 10);
  const shift = (d: string, days: number) => new Date(at(d) + days * 86_400_000).toISOString().slice(0, 10);
  const defaultFrom = shift(today, -14);
  const from = q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) && q.from <= today ? q.from : defaultFrom;
  const until = data?.best.until ?? today;
  const end = shift(from, 59) < until ? shift(from, 59) : until;
  const [past, then] = data && !data.best.missing && from < today ? await Promise.all([checkingHistory(from, today), pastForecasts(from, shift(today, -1))]) : [null, new Map<string, PastForecast>()];
  const href = (next: { case?: string; show?: string; from?: string }) => {
    const c = next.case ?? mode, s = next.show ?? show, f = next.from ?? from;
    const p = [c === "best" ? "case=best" : "", s === "list" ? "show=list" : "", f !== defaultFrom ? `from=${f}` : ""].filter(Boolean).join("&");
    return `/insights/cash${p ? `?${p}` : ""}`;
  };
  const later = shift(from, 30) <= today ? shift(from, 30) : end < until ? today : null;
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
              <h2 className="text-base font-bold">Checking, day by day</h2>
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
            <Chart from={from} end={end} best={data.best} worst={data.worst} mode={mode} past={past?.days ?? []} then={then} />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-3 text-muted">
                {past?.days.length ? (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="inline-block h-0.5 w-4 bg-foreground" />
                    Actual
                  </span>
                ) : null}
                {then.size ? (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="inline-block w-4 border-t-2 border-dotted border-muted" />
                    Forecast a week before
                  </span>
                ) : past?.days.length ? (
                  <span>Forecasts are saved from now on, to compare with what happened.</span>
                ) : null}
                {past === null && from < today ? <span>No bank history for checking.</span> : null}
              </span>
              <span className="flex items-center gap-1 font-semibold">
                <Link href={href({ from: shift(from, -30) })} className="rounded-lg px-2 py-1 text-accent-text hover:bg-neutral-soft">
                  ‹ Earlier
                </Link>
                {from !== defaultFrom ? (
                  <Link href={href({ from: defaultFrom })} className="rounded-lg px-2 py-1 text-accent-text hover:bg-neutral-soft">
                    Now
                  </Link>
                ) : null}
                {later && later !== from ? (
                  <Link href={href({ from: later })} className="rounded-lg px-2 py-1 text-accent-text hover:bg-neutral-soft">
                    Later ›
                  </Link>
                ) : null}
              </span>
            </div>
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
