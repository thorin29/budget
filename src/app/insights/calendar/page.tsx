/**
 * Calendar: checking's money in and out, day by day, two months at a time. Days before today show
 * what actually happened (bank rows and the closing balance) beside the forecast made a week
 * before; today on shows the forecast, in the worst or best case, from the same timing as the Cash
 * tab. A line on top says how close the week-ahead forecasts have been over the last 30 days.
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

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ case?: string; m?: string }> }) {
  const q = await searchParams;
  const mode: Case = q.case === "best" ? "best" : "worst";
  const data = await loadCash();
  const cash = data ? (mode === "worst" ? data.worst : data.best) : null;
  const thisMonth = (cash?.today ?? iso(Date.now())).slice(0, 7);
  const first = q.m && /^\d{4}-\d{2}$/.test(q.m) && q.m <= thisMonth ? q.m : thisMonth;
  const href = (c: Case, m: string) => {
    const p = [c === "best" ? "case=best" : "", m !== thisMonth ? `m=${m}` : ""].filter(Boolean).join("&");
    return `/insights/calendar${p ? `?${p}` : ""}`;
  };
  const sw = (
    <span className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 text-sm font-semibold">
        <Link href={href(mode, addMonths(first, -1))} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
          ‹ {label(addMonths(first, -1))}
        </Link>
        <span className="px-2">
          {label(first)} – {label(addMonths(first, 1))}
        </span>
        {first < thisMonth ? (
          <Link href={href(mode, addMonths(first, 1))} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
            {label(addMonths(first, 2))} ›
          </Link>
        ) : null}
      </span>
      <Switch
        options={[
          ["worst", "Worst case"],
          ["best", "Best case"],
        ]}
        on={mode}
        href={(v) => href(v as Case, first)}
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
  const from = `${first}-01`;
  const to = lastDay(addMonths(first, 1)) < cash.until ? lastDay(addMonths(first, 1)) : cash.until;
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
  const t0 = at(from), t1 = at(to);
  const start = t0 - new Date(t0).getUTCDay() * DAY;
  const end = t1 + (6 - new Date(t1).getUTCDay()) * DAY;
  const days: string[] = [];
  for (let t = start; t <= end; t += DAY) days.push(iso(t));
  const weeks = days.length / 7;
  const cushion = data.cushionCents;
  const tone = (cents: number | undefined) => (cents === undefined ? "" : cents < 0 ? "bg-danger-soft" : cents < cushion ? "bg-warn-soft" : "");

  return (
    <div className="space-y-4">
      <InsightsTabs right={sw} />
      <TabHeading title="Calendar" />
      <Card className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">
            Checking calendar{" "}
            <span className="text-xs font-normal text-muted">
              · before today: what happened, and the forecast a week before · from today: the forecast{cushion > 0 ? ` · amber below your ${money(cushion)} cushion` : ""} · red below $0
            </span>
          </h2>
          <span className="tnum text-sm">
            <b>{money(cash.startCents)}</b> now · lowest ahead <b className={cash.lowCents < 0 ? "text-danger" : ""}>{money(cash.lowCents)}</b> {day(cash.lowOn)}
          </span>
        </div>
        <p className={`mt-2 rounded-lg px-3 py-1.5 text-xs ${avgMiss === null ? "bg-neutral-soft text-muted" : "bg-info-soft text-foreground"}`}>
          {avgMiss === null
            ? "Forecast accuracy: forecasts are saved every day from now on. After a week, each past day shows the forecast made a week before, and this line says how close they were."
            : `Forecast accuracy, last ${misses.length} days: a week ahead, the ${mode} case was off by ${money(avgMiss)} on average, ${Math.abs(bias) < 1000 ? "with no lean either way" : `usually ${bias > 0 ? "lower" : "higher"} than what happened (by ${money(Math.abs(bias))})`}. Biggest miss ${money(Math.abs(worstMiss!.miss))} on ${day(worstMiss!.date)}.`}
        </p>
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 gap-1.5 pb-1 text-xs font-semibold text-muted">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5" style={{ gridTemplateRows: `repeat(${weeks}, minmax(4.4rem, auto))` }}>
              {days.map((d) => {
                const inWindow = d >= from && d <= to;
                const isPast = d < today;
                const p = isPast ? past.get(d) : undefined;
                const items: Array<{ label: string; cents: number; pay?: boolean }> = isPast ? (p?.items ?? []).map((i) => ({ ...i, pay: i.cents > 0 })) : (ahead.get(d) ?? []).map((s) => ({ label: s.label, cents: s.cents, pay: s.kind === "pay" }));
                const balance = isPast ? (inWindow ? p?.balanceCents : undefined) : ahead.get(d)?.at(-1)?.balanceCents;
                const f = isPast ? forecasts.get(d) : undefined;
                const fc = f ? (mode === "worst" ? f.worstCents : f.bestCents) : undefined;
                const low = d === cash.lowOn;
                const dayLabel = d === today || d.endsWith("-01") ? day(d) : String(Number(d.slice(8)));
                return (
                  <div
                    key={d}
                    className={`flex min-w-0 flex-col rounded-lg border px-2 py-1.5 ${inWindow ? `${isPast ? "border-line" : "border-line-strong"} ${tone(balance) || (isPast ? "bg-surface" : "bg-neutral-soft")}` : "border-transparent opacity-35"} ${low ? "ring-2 ring-foreground/70" : ""} ${d === today ? "ring-2 ring-accent" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-1 text-[11px]">
                      <b className={d === today ? "text-accent-text" : isPast ? "text-muted" : ""}>{dayLabel}</b>
                      {balance !== undefined ? <span className={`tnum ${balance < 0 ? "font-bold text-danger" : isPast ? "font-semibold" : "text-muted"}`}>{money(balance)}</span> : null}
                    </div>
                    {items.slice(0, 4).map((s, i) => (
                      <div key={`${s.label}:${i}`} className={`flex justify-between gap-1 text-[11px] ${s.pay ? "font-semibold text-ok" : ""}`} title={`${s.label}: ${signed(s.cents)}`}>
                        <span className="min-w-0 truncate">{s.label}</span>
                        <span className="tnum shrink-0">{signed(s.cents)}</span>
                      </div>
                    ))}
                    {items.length > 4 ? <div className="text-[11px] text-muted">+{items.length - 4} more</div> : null}
                    {isPast && inWindow && fc !== undefined && p ? (
                      <div className="mt-auto pt-0.5 text-[10px] text-muted" title={`Forecast made ${day(f!.takenOn)}`}>
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
