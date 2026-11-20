/**
 * Calendar: checking's money in and out, day by day through the end of next month, with the
 * balance after each day that has something on it. The same timing as the Cash tab, in the same
 * worst or best case.
 */

import { InsightsTabs } from "@/components/insights-tabs";
import { Card } from "@/components/ui";
import type { CashStep } from "@/lib/cash-timing";
import { TabHeading } from "../shared";
import { type Case, MissingChecking, Switch, day, loadCash, money, signed } from "../cash/parts";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const q = await searchParams;
  const mode: Case = q.case === "best" ? "best" : "worst";
  const data = await loadCash();
  const cash = data ? (mode === "worst" ? data.worst : data.best) : null;
  const sw = (
    <Switch
      options={[
        ["worst", "Worst case"],
        ["best", "Best case"],
      ]}
      on={mode}
      href={(v) => `/insights/calendar${v === "best" ? "?case=best" : ""}`}
    />
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

  const byDay = new Map<string, CashStep[]>();
  for (const s of cash.steps) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const t0 = at(cash.today), t1 = at(cash.until);
  const start = t0 - new Date(t0).getUTCDay() * DAY;
  const end = t1 + (6 - new Date(t1).getUTCDay()) * DAY;
  const days: string[] = [];
  for (let t = start; t <= end; t += DAY) days.push(iso(t));
  const weeks = days.length / 7;
  const cushion = data.cushionCents;
  const last = cash.steps.at(-1)?.balanceCents ?? cash.startCents;

  return (
    <div className="space-y-4">
      <InsightsTabs right={sw} />
      <TabHeading title="Calendar" />
      <Card className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">
            Checking calendar{" "}
            <span className="text-xs font-normal text-muted">
              · balance after each day with money moving{cushion > 0 ? ` · amber below your ${money(cushion)} cushion` : ""} · red below $0
            </span>
          </h2>
          <span className="tnum text-sm">
            <b>{money(cash.startCents)}</b> now · lowest <b className={cash.lowCents < 0 ? "text-danger" : ""}>{money(cash.lowCents)}</b> {day(cash.lowOn)} · <b>{money(last)}</b> {day(cash.until)}
          </span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 gap-1.5 pb-1 text-xs font-semibold text-muted">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5" style={{ gridTemplateRows: `repeat(${weeks}, minmax(5.25rem, auto))` }}>
              {days.map((d) => {
                const inWindow = d >= cash.today && d <= cash.until;
                const items = byDay.get(d) ?? [];
                const after = items.at(-1)?.balanceCents;
                const tone = after === undefined ? "" : after < 0 ? "bg-danger-soft" : after < cushion ? "bg-warn-soft" : "";
                const low = d === cash.lowOn;
                const label = d === cash.today || d.endsWith("-01") ? day(d) : String(Number(d.slice(8)));
                return (
                  <div
                    key={d}
                    className={`flex min-w-0 flex-col rounded-lg border px-2 py-1.5 ${inWindow ? `border-line-strong ${tone || "bg-neutral-soft"}` : "border-transparent opacity-35"} ${low ? "ring-2 ring-foreground/70" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-1 text-[11px]">
                      <b className={d === cash.today ? "text-accent-text" : ""}>{label}</b>
                      {after !== undefined ? <span className={`tnum ${after < 0 ? "font-bold text-danger" : "text-muted"}`}>{money(after)}</span> : null}
                    </div>
                    {items.map((s, i) => (
                      <div key={`${s.label}:${i}`} className={`flex justify-between gap-1 text-[11px] ${s.kind === "pay" ? "font-semibold text-ok" : ""}`} title={`${s.label}: ${signed(s.cents)}`}>
                        <span className="min-w-0 truncate">{s.label}</span>
                        <span className="tnum shrink-0">{signed(s.cents)}</span>
                      </div>
                    ))}
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
