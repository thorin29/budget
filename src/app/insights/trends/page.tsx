/**
 * Trends, in three views that each fit one screen: Categories (where the month's everyday spending
 * went, against the three months before), Months (income against expenses for a year), and
 * Suggestions. Every figure comes from the month plan, the same source as the other tabs, so
 * Bills, Everyday spending and income − expenses match them.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { InsightsTabs } from "@/components/insights-tabs";
import { getSuggestions } from "@/server/insights";
import type { Suggestion } from "@/lib/insight-suggestions";
import { getMonthPlan, type MonthPlanView } from "@/server/month-plan";
import { recentPlans, trendMonth, type TrendMonth } from "@/server/plan-charts";
import { MonthPicker, TabHeading, monthLabel, monthParam, pickMonth } from "../shared";
import { formatCents } from "@/lib/money";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const money = (cents: number) => formatCents(cents);
const whole = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const short = (ym: string) => monthLabel(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), "short").split(" ")[0];
const long = (ym: string) => monthLabel(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), "long").split(" ")[0];

type View = "categories" | "months" | "suggestions";
const VIEWS: Array<[View, string]> = [
  ["categories", "Categories"],
  ["months", "Months"],
  ["suggestions", "Suggestions"],
];

/** The average of the closed months before [ym] (up to three), or null without any. */
function usual<T extends { month: string }>(rows: T[], ym: string, pick: (r: T) => number): number | null {
  const before = rows.filter((r) => r.month < ym).slice(-3);
  return before.length ? Math.round(before.reduce((t, r) => t + pick(r), 0) / before.length) : null;
}

function versus(cents: number, avg: number | null) {
  if (avg === null) return "No earlier months";
  const d = cents - avg;
  if (Math.abs(d) < Math.max(1_000, Math.abs(avg) * 0.03)) return "About usual";
  return `${whole(Math.abs(d))} ${d > 0 ? "more" : "less"} than usual`;
}

// ---------------------------------------------------------------- categories

interface CatRow {
  key: string;
  id: string | null;
  name: string;
  cents: number;
  avgCents: number | null;
}

function categoryRows(plan: MonthPlanView, before: MonthPlanView[]): CatRow[] {
  const byKey = (p: MonthPlanView) => {
    const m = new Map<string, { id: string | null; name: string; cents: number }>();
    for (const g of p.groups)
      for (const c of g.categories) {
        const key = c.id ?? "none";
        const r = m.get(key) ?? { id: c.id, name: c.name, cents: 0 };
        r.cents += c.spentCents;
        m.set(key, r);
      }
    return m;
  };
  const now = byKey(plan);
  const past = before.map(byKey);
  const keys = new Set([...now.keys(), ...past.flatMap((m) => [...m.keys()])]);
  return [...keys]
    .map((key) => {
      const r = now.get(key) ?? past.map((m) => m.get(key)).find(Boolean)!;
      const avg = past.length ? Math.round(past.reduce((t, m) => t + (m.get(key)?.cents ?? 0), 0) / past.length) : null;
      return { key, id: r.id, name: r.name, cents: now.get(key)?.cents ?? 0, avgCents: avg };
    })
    .filter((r) => r.cents !== 0 || (r.avgCents ?? 0) > 0);
}

function CategoriesView({ plan, before, sort }: { plan: MonthPlanView; before: MonthPlanView[]; sort: "biggest" | "change" }) {
  const rows = categoryRows(plan, before).sort((a, b) =>
    sort === "change" ? Math.abs(b.cents - (b.avgCents ?? b.cents)) - Math.abs(a.cents - (a.avgCents ?? a.cents)) : b.cents - a.cents,
  );
  const max = Math.max(1, ...rows.map((r) => Math.max(r.cents, r.avgCents ?? 0)));
  const total = rows.reduce((t, r) => t + r.cents, 0);
  const merchants = new Map<string, { cents: number; count: number }>();
  for (const g of plan.groups)
    for (const c of g.categories)
      for (const t of c.transactions) {
        const m = merchants.get(t.name) ?? { cents: 0, count: 0 };
        m.cents += t.cents;
        m.count += 1;
        merchants.set(t.name, m);
      }
  const top = [...merchants].sort((a, b) => b[1].cents - a[1].cents).slice(0, 12);
  const href = (s: string) => `/insights/trends?view=categories&sort=${s}&m=${plan.month}`;
  const half = Math.ceil(rows.length / 2);
  const row = (r: CatRow) => {
    const d = r.avgCents === null ? 0 : r.cents - r.avgCents;
    const flat = r.avgCents === null || Math.abs(d) < Math.max(1_000, r.avgCents * 0.1);
    return (
      <li key={r.key}>
        <Link
          href={`/insights/category/${r.id ?? "none"}?m=${plan.month}`}
          title={`${r.name}: ${money(r.cents)}${r.avgCents !== null ? ` · ${money(r.avgCents)} usual` : ""}`}
          className="grid grid-cols-[minmax(0,7.5rem)_minmax(3rem,1fr)_4rem_4rem] items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm hover:bg-neutral-soft"
        >
          <span className={`truncate font-semibold ${r.id ? "" : "text-muted"}`}>{r.name}</span>
          <span className="relative block h-2.5 rounded-full bg-neutral-soft">
            <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--series-1)]" style={{ width: `${(Math.max(0, r.cents) / max) * 100}%` }} />
            {r.avgCents ? <span aria-hidden className="absolute -top-1 h-[18px] w-0.5 rounded bg-foreground/70" style={{ left: `calc(${(r.avgCents / max) * 100}% - 1px)` }} /> : null}
          </span>
          <span className="tnum text-right font-semibold">{whole(r.cents)}</span>
          <span className={`tnum text-right text-xs font-bold ${flat ? "font-normal text-muted" : d > 0 ? "text-warn" : "text-ok"}`}>
            {flat ? "usual" : `${d > 0 ? "▲" : "▼"} ${whole(Math.abs(d))}`}
          </span>
        </Link>
      </li>
    );
  };
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">
            Where it went <span className="tnum font-normal text-muted">· {whole(total)} everyday spending</span>
          </h2>
          <span className="flex items-center gap-3 text-xs text-muted">
            <span>Line = usual (3-month average)</span>
            <span>
              Sort:{" "}
              <Link href={href("biggest")} className={sort === "biggest" ? "font-bold text-foreground" : "hover:underline"}>
                Biggest
              </Link>{" "}
              ·{" "}
              <Link href={href("change")} className={sort === "change" ? "font-bold text-foreground" : "hover:underline"}>
                Most changed
              </Link>
            </span>
          </span>
        </div>
        {rows.length ? (
          <div className="grid gap-x-6 2xl:grid-cols-2">
            <ul>{rows.slice(0, half).map(row)}</ul>
            <ul>{rows.slice(half).map(row)}</ul>
          </div>
        ) : (
          <p className="text-sm text-muted">No everyday spending this month.</p>
        )}
      </Card>
      <Card>
        <h2 className="text-base font-bold">Top Merchants</h2>
        {top.length ? (
          <ol className="mt-2 divide-y divide-line text-sm">
            {top.map(([name, m]) => (
              <li key={name} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  {name}
                  {m.count > 1 ? <span className="ml-1.5 text-xs text-muted">×{m.count}</span> : null}
                </span>
                <span className="tnum shrink-0 font-semibold">{whole(m.cents)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted">No everyday spending this month.</p>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- months

function MonthsView({ months, selected, everydayOnly }: { months: TrendMonth[]; selected: string; everydayOnly: boolean }) {
  const sel = months.find((m) => m.month === selected) ?? months[months.length - 1];
  const out = (m: TrendMonth) => (everydayOnly ? m.everydayCents : m.expensesCents);
  const max = Math.max(1, ...months.map((m) => Math.max(everydayOnly ? 0 : m.incomeCents, out(m))));
  const closed = months.filter((m) => !m.projected);
  const totalNet = closed.reduce((t, m) => t + m.netCents, 0);
  const avg = (pick: (m: TrendMonth) => number) => usual(closed, sel.month, pick);
  const href = (e: boolean) => `/insights/trends?view=months${e ? "&out=everyday" : ""}&m=${selected}`;
  const panel: Array<[string, number, number | null, boolean?]> = [
    ["Income", sel.incomeCents, avg((m) => m.incomeCents)],
    ["Bills", sel.billsCents, avg((m) => m.billsCents)],
    ...(sel.otherCents || closed.some((m) => m.otherCents) ? ([["Charges that may be bills", sel.otherCents, avg((m) => m.otherCents)]] as Array<[string, number, number | null]>) : []),
    ...(sel.debtCents || closed.some((m) => m.debtCents) ? ([["Debt payment", sel.debtCents, avg((m) => m.debtCents)]] as Array<[string, number, number | null]>) : []),
    [sel.projected ? "Everyday spending, projected" : "Everyday spending", sel.everydayCents, avg((m) => m.everydayCents)],
    ["Unplanned, so far", sel.unplannedCents, avg((m) => m.unplannedCents), true],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">{everydayOnly ? "Everyday spending, by month" : "Income vs expenses, by month"}</h2>
            <p className="text-xs text-muted">
              {everydayOnly
                ? "Essentials, Extras and Unplanned"
                : `Last ${closed.length} full months: ${totalNet < 0 ? "expenses ran" : "income ran"} ${whole(Math.abs(totalNet))} ahead`}
              {months.some((m) => m.projected) ? ` · ${short(months.find((m) => m.projected)!.month)} is projected` : ""}
            </p>
          </div>
          <span className="flex gap-0.5 rounded-lg bg-neutral-soft p-0.5 text-xs font-semibold">
            <Link href={href(false)} className={`rounded-md px-2.5 py-1 ${everydayOnly ? "text-muted" : "bg-surface shadow-card"}`}>
              All expenses
            </Link>
            <Link href={href(true)} className={`rounded-md px-2.5 py-1 ${everydayOnly ? "bg-surface shadow-card" : "text-muted"}`}>
              Everyday only
            </Link>
          </span>
        </div>
        <div className="mt-4 flex h-72 items-end gap-1.5" role="img" aria-label="Income and expenses by month">
          {months.map((m) => {
            const on = m.month === sel.month;
            const tip = `${long(m.month)}: ${money(m.incomeCents)} income, ${money(out(m))} ${everydayOnly ? "everyday spending" : "expenses"}${m.projected ? " (projected)" : ""}`;
            return (
              <Link key={m.month} href={`/insights/trends?view=months${everydayOnly ? "&out=everyday" : ""}&m=${m.month}`} title={tip} className="flex h-full flex-1 items-end justify-center gap-0.5">
                {everydayOnly ? null : <span className="w-[38%] max-w-7 rounded-t bg-[var(--series-1)]" style={{ height: `${(m.incomeCents / max) * 100}%`, opacity: on ? 1 : 0.55 }} />}
                <span
                  className={`${everydayOnly ? "w-[60%] max-w-10" : "w-[38%] max-w-7"} rounded-t ${m.projected ? "border-2 border-dashed border-[var(--series-2)]" : "bg-[var(--series-2)]"}`}
                  style={{
                    height: `${(Math.max(0, out(m)) / max) * 100}%`,
                    opacity: on ? 1 : 0.55,
                    ...(m.projected ? { background: "repeating-linear-gradient(45deg, color-mix(in oklab, var(--series-2) 35%, transparent) 0 4px, transparent 4px 8px)" } : {}),
                  }}
                />
              </Link>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5 text-center">
          {months.map((m) => {
            const on = m.month === sel.month;
            const v = everydayOnly ? m.everydayCents : m.netCents;
            return (
              <div key={m.month} className="min-w-0 flex-1">
                <span className={`block truncate text-xs ${on ? "font-bold" : "text-muted"}`}>{short(m.month)}</span>
                <span className={`tnum block truncate text-[11px] ${on ? "font-bold" : ""} ${everydayOnly ? "text-muted" : v < 0 ? "text-danger" : "text-ok"}`}>
                  {everydayOnly ? whole(v) : `${v < 0 ? "−" : "+"}${whole(Math.abs(v))}`}
                </span>
              </div>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {everydayOnly ? null : (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[var(--series-1)]" />
              Income
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[var(--series-2)]" />
            {everydayOnly ? "Everyday spending" : "Expenses"}
          </li>
          {everydayOnly ? null : <li>Under each month: income − expenses</li>}
        </ul>
      </Card>
      <Card>
        <h2 className="text-base font-bold">{long(sel.month)} vs usual</h2>
        <p className="text-xs text-muted">Usual = average of the 3 full months before</p>
        <dl className="mt-2 divide-y divide-line text-sm">
          {panel.map(([label, cents, a, sub]) => (
            <div key={label} className={`flex items-baseline justify-between gap-3 py-2 ${sub ? "pl-3" : ""}`}>
              <dt>
                <span className={sub ? "text-muted" : ""}>{label}</span>
                <span className="block text-xs text-muted">{versus(cents, a)}</span>
              </dt>
              <dd className={`tnum font-bold ${sub ? "font-semibold text-muted" : ""}`}>{whole(cents)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 py-2 font-bold">
            <dt>Income − expenses{sel.projected ? ", projected" : ""}</dt>
            <dd className={`tnum ${sel.netCents < 0 ? "text-danger" : "text-ok"}`}>{whole(sel.netCents)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- suggestions

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

function SuggestionsView({ items }: { items: Suggestion[] }) {
  const keep = items.reduce((s, x) => s + x.monthlyCents, 0);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Suggestions</h2>
        <span className="text-xs text-muted">
          From the last six full months
          {keep > 0 ? (
            <>
              {" "}· together up to <span className="font-semibold text-foreground">{whole(keep)}</span> a month
            </>
          ) : null}
        </span>
      </div>
      {items.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
      ) : (
        <p className="text-sm text-muted">Nothing to suggest from the last six months.</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- page

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ m?: string; view?: string; sort?: string; out?: string }> }) {
  const { m, view: v, sort, out } = await searchParams;
  const view: View = v === "months" || v === "suggestions" ? v : "categories";
  const picked = pickMonth(m);
  const plan = await getMonthPlan(picked.year, picked.month).catch((error: unknown) => (console.error("Month plan:", error), null));
  const ym = monthParam(picked);

  let body: ReactNode = null;
  if (view === "suggestions") {
    body = <SuggestionsView items={await getSuggestions().catch(() => [])} />;
  } else if (!plan) {
    body = (
      <Card>
        <p className="text-sm text-muted">The month couldn&rsquo;t be worked out. Check that the server can reach the database.</p>
      </Card>
    );
  } else if (view === "categories") {
    const plans = await recentPlans(plan, 4);
    body = <CategoriesView plan={plan} before={plans.filter((p) => p.month < plan.month && p.closed)} sort={sort === "change" ? "change" : "biggest"} />;
  } else {
    // Months with nothing in or out are before the history starts: leave them off.
    const months = (await recentPlans(plan, 12)).map(trendMonth);
    const first = months.findIndex((x) => x.incomeCents || x.expensesCents);
    body = <MonthsView months={months.slice(Math.max(0, first))} selected={ym} everydayOnly={out === "everyday"} />;
  }

  const tab = (k: View) => `/insights/trends?view=${k}&m=${ym}`;
  return (
    <div className="space-y-4">
      <InsightsTabs
        right={
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex gap-0.5 rounded-xl border border-line bg-surface p-1 text-sm font-semibold">
              {VIEWS.map(([k, label]) => (
                <Link key={k} href={tab(k)} className={`rounded-lg px-3 py-1 ${k === view ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
                  {label}
                </Link>
              ))}
            </span>
            <MonthPicker path={`/insights/trends?view=${view}${sort === "change" ? "&sort=change" : ""}${out === "everyday" ? "&out=everyday" : ""}`} year={picked.year} month={picked.month} />
          </span>
        }
      />
      <TabHeading title="Trends" />
      {body}
    </div>
  );
}
