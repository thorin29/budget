/**
 * Calendar: checking's money in and out, a month at a time. Days before today show what actually
 * happened (bank rows, repeats combined, and the closing balance) with the forecast made a week
 * before; today on shows the forecast, in the worst or best case, from the same timing as the Cash
 * tab. Days forecast to run low (under the cushion) or short (below $0) are highlighted. Once
 * there are saved forecasts, a line on top says how close the week-ahead ones have been.
 */

import Link from "next/link";
import { InsightsTabs } from "@/components/insights-tabs";
import { Card } from "@/components/ui";
import type { CashStep } from "@/lib/cash-timing";
import { checkingHistory, type PastDay } from "@/server/checking-history";
import { pastForecasts } from "@/server/cash-cases";
import { TabHeading, monthLabel } from "../shared";
import { type Case, MissingChecking, Switch, day, loadCash, money, signed } from "../cash/parts";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const addMonths = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const lastDay = (ym: string) => iso(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0));
const label = (ym: string) => monthLabel(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), "short");

/** Same-named rows on one day as one line: "Coinbase ×3". */
function combine(items: Array<{ label: string; cents: number; pay?: boolean }>) {
  const m = new Map<string, { label: string; cents: number; pay?: boolean; count: number }>();
  for (const i of items) {
    const k = i.label.trim().toLowerCase();
    const had = m.get(k);
    if (had) {
      had.cents += i.cents;
      had.count += 1;
    } else m.set(k, { ...i, count: 1 });
  }
  return [...m.values()];
}

const LEGEND: Array<[string, string]> = [
  ["bg-info-soft", "Actual"],
  ["bg-neutral-soft", "Forecast"],
  ["bg-warn-soft", "Low: under your cushion"],
  ["bg-danger-soft", "Short: below $0"],
];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ case?: string; m?: string }> }) {
  const q = await searchParams;
  const mode: Case = q.case === "best" ? "best" : "worst";
  const data = await loadCash();
  const cash = data ? (mode === "worst" ? data.worst : data.best) : null;
  const thisMonth = (cash?.today ?? iso(Date.now())).slice(0, 7);
  const lastMonth = (cash?.until ?? iso(Date.now())).slice(0, 7);
  const month = q.m && /^\d{4}-\d{2}$/.test(q.m) && q.m <= lastMonth ? q.m : thisMonth;
  const href = (c: Case, m: string) => {
    const p = [c === "best" ? "case=best" : "", m !== thisMonth ? `m=${m}` : ""].filter(Boolean).join("&");
    return `/insights/calendar${p ? `?${p}` : ""}`;
  };
  const sw = (
    <span className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 text-sm font-semibold">
        <Link href={href(mode, addMonths(month, -1))} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
          ‹ {label(addMonths(month, -1)).split(" ")[0]}
        </Link>
        <span className="px-2">{monthLabel(Number(month.slice(0, 4)), Number(month.slice(5, 7)), "long")}</span>
        {month < lastMonth ? (
          <Link href={href(mode, addMonths(month, 1))} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
            {label(addMonths(month, 1)).split(" ")[0]} ›
          </Link>
        ) : (
          <span className="px-2.5 py-1 text-muted/50">{label(addMonths(month, 1)).split(" ")[0]} ›</span>
        )}
      </span>
      <Switch
        options={[
          ["worst", "Worst case"],
          ["best", "Best case"],
        ]}
        on={mode}
        href={(v) => href(v as Case, month)}
      />
    </span>
  );
  if (!data || !cash || cash.missing)
    return (
      <div className="space-y-4">
        <InsightsTabs right={sw} />
        <TabHeading title="Calendar" />
        <Card>
          <MissingChecking />
        </Card>
      </div>
    );

  const today = cash.today;
  const from = `${month}-01`;
  const to = lastDay(month);
  const accFrom = iso(at(today) - 30 * DAY);
  const histFrom = from < accFrom ? from : accFrom;
  const [history, forecasts] = await Promise.all([checkingHistory(histFrom, today), pastForecasts(histFrom, iso(at(today) - DAY))]);
  const past = new Map<string, PastDay>((history?.days ?? []).map((d) => [d.date, d]));

  // How close the week-ahead forecasts were, over the last 30 days.
  const misses = [...past.values()]
    .filter((d) => d.date >= accFrom && forecasts.has(d.date))
    .map((d) => {
      const f = forecasts.get(d.date)!;
      return { date: d.date, miss: d.balanceCents - (mode === "worst" ? f.worstCents : f.bestCents) };
    });
  const avgMiss = misses.length ? Math.round(misses.reduce((t, m) => t + Math.abs(m.miss), 0) / misses.length) : null;
  const bias = misses.length ? Math.round(misses.reduce((t, m) => t + m.miss, 0) / misses.length) : 0;
  const worstMiss = misses.length ? misses.reduce((w, m) => (Math.abs(m.miss) > Math.abs(w.miss) ? m : w)) : null;

  const ahead = new Map<string, CashStep[]>();
  for (const s of cash.steps) ahead.set(s.date, [...(ahead.get(s.date) ?? []), s]);
  // The balance at the end of every day ahead (days with nothing on them keep the day before's).
  const closing = new Map<string, number>();
  {
    let bal = cash.startCents;
    for (let t = at(today); t <= at(cash.until); t += DAY) {
      const d = iso(t);
      const last = ahead.get(d)?.at(-1);
      if (last) bal = last.balanceCents;
      closing.set(d, bal);
    }
  }
  const t0 = at(from), t1 = at(to);
  const start = t0 - new Date(t0).getUTCDay() * DAY;
  const end = t1 + (6 - new Date(t1).getUTCDay()) * DAY;
  const days: string[] = [];
  for (let t = start; t <= end; t += DAY) days.push(iso(t));
  const cushion = data.cushionCents;
  const flag = (cents: number | undefined) => (cents === undefined ? "" : cents < 0 ? "bg-danger-soft" : cents < cushion ? "bg-warn-soft" : "");

  return (
    <div className="space-y-4">
      <InsightsTabs right={sw} />
      <TabHeading title="Calendar" />
      <Card className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">Checking calendar</h2>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {LEGEND.map(([cls, text]) => (
              <li key={text} className="flex items-center gap-1.5">
                <span aria-hidden className={`inline-block h-3 w-3 rounded border border-line-strong ${cls}`} />
                {text}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded ring-2 ring-foreground/70" />
              Lowest ahead
            </li>
          </ul>
          <span className="tnum text-sm">
            <b>{money(cash.startCents)}</b> now · lowest ahead <b className={cash.lowCents < 0 ? "text-danger" : ""}>{money(cash.lowCents)}</b> {day(cash.lowOn)}
          </span>
        </div>
        {avgMiss !== null ? (
          <p className="mt-2 rounded-lg bg-info-soft px-3 py-1.5 text-xs">
            Forecast accuracy, last {misses.length} days: a week ahead, the {mode} case was off by {money(avgMiss)} on average,{" "}
            {Math.abs(bias) < 1000 ? "with no lean either way" : `usually ${bias > 0 ? "lower" : "higher"} than what happened (by ${money(Math.abs(bias))})`}. Biggest miss {money(Math.abs(worstMiss!.miss))} on {day(worstMiss!.date)}.
          </p>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 gap-1.5 pb-1 text-xs font-semibold text-muted">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5" style={{ gridAutoRows: `clamp(6.25rem, calc((100vh - ${avgMiss !== null ? 18.5 : 16.5}rem) / ${days.length / 7}), 9rem)` }}>
              {days.map((d) => {
                const inMonth = d >= from && d <= to;
                const isPast = d < today;
                const known = isPast ? past.has(d) : d <= cash.until;
                const p = isPast ? past.get(d) : undefined;
                const items = combine(isPast ? (p?.items ?? []).map((i) => ({ ...i, pay: i.cents > 0 })) : (ahead.get(d) ?? []).map((s) => ({ label: s.label, cents: s.cents, pay: s.kind === "pay" })));
                const balance = isPast ? p?.balanceCents : closing.get(d);
                const f = isPast ? forecasts.get(d) : undefined;
                const fc = f ? (mode === "worst" ? f.worstCents : f.bestCents) : undefined;
                const low = d === cash.lowOn;
                const base = isPast ? "bg-info-soft" : "bg-neutral-soft";
                const bg = flag(balance) || base;
                return (
                  <div
                    key={d}
                    className={`flex min-w-0 flex-col overflow-hidden rounded-lg border px-2 py-1.5 ${inMonth && known ? `border-line-strong ${bg}` : inMonth ? "border-line" : "border-transparent opacity-30"} ${low && inMonth ? "ring-2 ring-foreground/70" : ""} ${d === today ? "ring-2 ring-accent" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-1 text-[11px]">
                      <b className={d === today ? "text-accent-text" : ""}>{Number(d.slice(8))}</b>
                      {inMonth && balance !== undefined ? <span className={`tnum font-semibold ${balance < 0 ? "text-danger" : isPast ? "" : "text-muted"}`}>{money(balance)}</span> : null}
                    </div>
                    {inMonth
                      ? items.slice(0, 4).map((s, i) => (
                          <div key={`${s.label}:${i}`} className={`flex justify-between gap-1 text-[11px] leading-4 ${s.pay ? "font-semibold text-ok" : ""}`} title={`${s.label}${s.count > 1 ? ` ×${s.count}` : ""}: ${signed(s.cents)}`}>
                            <span className="min-w-0 truncate">
                              {s.label}
                              {s.count > 1 ? <span className="text-muted"> ×{s.count}</span> : null}
                            </span>
                            <span className="tnum shrink-0">{signed(s.cents)}</span>
                          </div>
                        ))
                      : null}
                    {inMonth && items.length > 4 ? <div className="text-[11px] leading-4 text-muted">+{items.length - 4} more</div> : null}
                    {isPast && inMonth && fc !== undefined && p ? (
                      <div className="mt-auto text-[10px] text-muted" title={`Forecast made ${day(f!.takenOn)}`}>
                        forecast {money(fc)} · {p.balanceCents - fc >= 0 ? "+" : "−"}
                        {money(Math.abs(p.balanceCents - fc))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
