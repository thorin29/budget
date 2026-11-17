"use client";

/**
 * Spending envelopes for the pay period in progress: the flexible money left,
 * where each paycheck goes, every envelope, "Can I afford it?", and changing
 * limits (change one and the automatic ones follow).
 */

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { EnvelopesView, EnvelopeView } from "@/server/envelopes";
import { assignLimits, type Tier } from "@/lib/envelopes";
import { Button, Card, CONTROL } from "@/components/ui";
import {
  resetLimitsAction,
  setLimitsAction,
  type EnvelopeState,
} from "./envelope-actions";
import { DebtChart, HistoryBars, LeftDonut, LeftPaceChart, PaydayPlanCard } from "./plan-charts";

const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const day = (iso: string, withWeekday = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    ...(withWeekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const TIER_TITLE: Record<Tier, { title: string; note: string }> = {
  ESSENTIAL: {
    title: "Essentials",
    note: "Protected. What isn't used stays in the budget for a later pay period.",
  },
  PLANNED: {
    title: "Planned",
    note: "Giving, sports and other spending you plan for.",
  },
  FLEXIBLE: {
    title: "Flexible",
    note: "One shared pot. A budget that runs over takes from the others.",
  },
};

function Bar({
  used,
  tone,
}: {
  used: number;
  tone: "ok" | "warn" | "over" | "plain";
}) {
  const color =
    tone === "over"
      ? "bg-danger"
      : tone === "warn"
        ? "bg-warn"
        : tone === "ok"
          ? "bg-ok"
          : "bg-accent";
  return (
    <span
      className="mt-1.5 block h-2 overflow-hidden rounded-full bg-neutral-soft"
      aria-hidden
    >
      <span
        className={`block h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, used * 100))}%` }}
      />
    </span>
  );
}

function EnvelopeRow({ e, daysShare }: { e: EnvelopeView; daysShare: number }) {
  const have = e.limitCents + (e.carriedCents ?? 0);
  const used = have > 0 ? e.spentCents / have : e.spentCents > 0 ? 1 : 0;
  // Ahead of pace: more of the money is gone than of the pay period.
  const tone =
    e.overCents > 0
      ? "over"
      : e.saveUp
        ? "ok"
        : used > Math.min(1, daysShare + 0.2)
          ? "warn"
          : e.tier === "FLEXIBLE"
            ? "plain"
            : "ok";
  const carriedIn =
    !e.saveUp && (e.carriedCents ?? 0) > 0 ? e.carriedCents! : 0;
  return (
    <li className="py-2.5">
      <details className="group">
        <summary className="cursor-pointer list-none">
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold group-open:underline">
              {e.name}
            </span>
            {e.overCents > 0 ? (
              <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">
                {money(e.overCents)} over
              </span>
            ) : e.saveUp ? (
              <span className="tnum shrink-0">
                <b>{money(e.leftCents)}</b>{" "}
                <span className="text-xs text-muted">
                  saved
                  {e.saveUpTargetCents
                    ? ` of ${money(e.saveUpTargetCents)}`
                    : ""}
                </span>
              </span>
            ) : (
              <span className="tnum shrink-0">
                <b>{money(e.leftCents)}</b>{" "}
                <span className="text-xs text-muted">
                  left of {money(have)}
                </span>
              </span>
            )}
          </span>
          <Bar
            used={
              e.saveUp && e.saveUpTargetCents
                ? e.leftCents / e.saveUpTargetCents
                : used
            }
            tone={tone}
          />
          <span className="mt-1 block text-xs text-muted">
            {e.saveUp
              ? `${money(e.limitCents)} set aside each payday${e.spentCents ? ` · ${money(e.spentCents)} spent from it this period` : ""}`
              : e.overCents > 0
                ? `${money(e.spentCents)} spent of ${money(have)}`
                : [
                    e.gaveCents > 0
                      ? `Gave ${money(e.gaveCents)} to cover another budget`
                      : null,
                    carriedIn
                      ? `Includes ${money(carriedIn)} not used earlier`
                      : null,
                    tone === "warn" ? "Going faster than the pay period" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
          </span>
        </summary>
        <ul className="mt-2 space-y-1 rounded-xl bg-neutral-soft px-3 py-2 text-xs">
          {e.categories.length ? (
            e.categories.map((c) => (
              <li key={c.id ?? "none"} className="flex justify-between gap-3">
                <Link
                  href={`/insights/category/${c.id ?? "none"}`}
                  className="truncate hover:underline"
                >
                  {c.name}
                </Link>
                <span className="tnum">{money(c.spentCents)}</span>
              </li>
            ))
          ) : (
            <li className="text-muted">Nothing spent from it since payday.</li>
          )}
        </ul>
      </details>
    </li>
  );
}

function Limits({ view }: { view: EnvelopesView }) {
  const editable = view.groups.filter((g) => g.id !== "other" && g.id !== "extra");
  const [manual, setManual] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      editable
        .filter((g) => !g.automatic)
        .map((g) => [g.id, String(Math.round(g.limitCents / 100))]),
    ),
  );
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  const parsed = (id: string): number | null => {
    const raw = manual[id];
    if (raw === undefined || raw.trim() === "") return null;
    const n = Math.round(Number(raw.replace(/[$,\s]/g, "")) * 100);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const preview = useMemo(
    () =>
      assignLimits({
        incomeCents: view.incomeCents,
        billsCents: view.billsCents,
        debtCents: view.debt.perPeriodCents,
        groups: view.groups.filter((g) => g.id !== "extra").map((g) => ({
          id: g.id,
          tier: g.tier,
          averageCents: g.averageCents,
          manualCents: g.id === "other" || g.id === "extra" ? null : parsed(g.id),
        })),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manual, view],
  );
  return (
    <Card>
      <h2 className="text-base font-bold">Change limits</h2>
      <p className="mt-0.5 max-w-prose text-xs text-muted">
        Per pay period. Type a limit to set it. Essentials and planned budgets
        left on automatic take their usual amount; flexible ones share whatever
        is left, so changing one moves the others.
      </p>
      {(["ESSENTIAL", "PLANNED", "FLEXIBLE"] as Tier[]).map((tier) => {
        const rows = editable.filter((g) => g.tier === tier);
        if (!rows.length) return null;
        return (
          <div key={tier} className="mt-3">
            <h3 className="flex justify-between gap-3 text-[11px] font-bold uppercase tracking-wider text-muted">
              <span>{TIER_TITLE[tier].title}</span>
              {tier === "FLEXIBLE" ? (
                <span className="tnum normal-case tracking-normal">
                  pot: {money(preview.flexibleCents)}
                </span>
              ) : null}
            </h3>
            <ul className="divide-y divide-line">
              {rows.map((g) => {
                const set = parsed(g.id) !== null;
                return (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{g.name}</span>{" "}
                      <span className="text-xs text-muted">
                        usually {money(g.averageCents)}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-right text-muted">
                      {set ? "" : money(preview.limits.get(g.id) ?? 0)}
                    </span>
                    <span className="w-24 shrink-0">
                      <input
                        aria-label={`Limit for ${g.name}`}
                        className={CONTROL}
                        inputMode="decimal"
                        placeholder="auto"
                        value={manual[g.id] ?? ""}
                        onChange={(e) =>
                          setManual({ ...manual, [g.id]: e.target.value })
                        }
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {preview.shortCents > 0 ? (
        <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          The flexible limits add up to {money(preview.shortCents)} more than
          the pot.
        </p>
      ) : preview.flexibleCents === 0 ? (
        <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          Nothing is left for flexible spending. Lower an essential or planned
          limit, or the debt payment, to make room.
        </p>
      ) : preview.unassignedCents >= 100 ? (
        <p className="mt-2 text-xs text-muted">
          {money(preview.unassignedCents)} of the pot isn&rsquo;t needed by any
          budget. It&rsquo;s extra for debt.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () =>
              setState(
                await setLimitsAction(
                  Object.fromEntries(editable.map((g) => [g.id, parsed(g.id)])),
                ),
              ),
            )
          }
        >
          Save limits
        </Button>
        <Button
          type="button"
          variant="quiet"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setManual({});
              setState(await resetLimitsAction());
            })
          }
        >
          Reset to automatic
        </Button>
        {state ? (
          <span
            className={`text-xs ${state.ok ? "text-muted" : "text-danger"}`}
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function Envelopes({ view }: { view: EnvelopesView }) {
  const p = view.period;
  const daysShare = p.days > 0 ? (p.days - p.daysLeft) / p.days : 0;
  const until = p.byPayday
    ? `until payday, ${day(p.next, true)}`
    : `until ${day(p.next)}`;
  const d = view.debt;
  const late = d.endsOn && d.doneOn && d.doneOn > d.endsOn;
  const steps: Array<{ label: string; cents: number; note: string }> = [
    {
      label: "Bills",
      cents: view.billsCents,
      note: view.basis === "due" ? `Bills due by ${day(p.next)}` : "A share of the plan's bills",
    },
    {
      label: "Essentials",
      cents: view.essentialCents,
      note: "Food, fuel, medical and the like",
    },
    { label: "Planned", cents: view.plannedCents, note: "Giving, sports and other planned spending" },
    {
      label: "Debt payoff",
      cents: d.perPeriodCents,
      note:
        d.balanceCents === null
          ? d.automatic
            ? "From the plan's payments"
            : "Set by you"
          : d.doneOn === null
            ? `${money(d.balanceCents)} owed${d.name ? ` on ${d.name}` : ""}. Nothing is going to it yet.`
            : `${money(d.balanceCents)} owed${d.name ? ` on ${d.name}` : ""}${d.source === "minimum" ? " · about the minimum payment" : ""} · clears ${monthYear(d.doneOn)} at this rate`,
    },
    {
      label: "Flexible",
      cents: view.flexibleCents,
      note: "What's left, shared by the flexible budgets",
    },
  ];
  return (
    <section className="space-y-4" aria-label="Spending plan">
      {p.byPayday || p.view === "month" ? (
        <nav aria-label="Spending plan period" className="inline-flex gap-1 rounded-xl bg-neutral-soft p-1 text-sm">
          {[
            { v: "period", label: "This pay period" },
            { v: "month", label: "This month" },
          ].map((o) => (
            <Link
              key={o.v}
              href={o.v === "period" ? "/insights" : "/insights?view=month"}
              aria-current={p.view === o.v ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 font-semibold ${p.view === o.v ? "bg-surface shadow-card ring-1 ring-line" : "text-muted hover:text-foreground"}`}
            >
              {o.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <LeftDonut view={view} until={until} />
          {view.message ? (
            <p
              className={`rounded-xl px-3.5 py-2.5 text-sm ${view.standing === "ok" || view.standing === "low" ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"}`}
            >
              {view.message}
            </p>
          ) : null}
          {view.lastPeriod && view.lastPeriod.leftoverCents >= 100 ? (
            <p className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">
              <b>{money(view.lastPeriod.leftoverCents)}</b> of flexible money
              wasn&rsquo;t spent last pay period ({day(view.lastPeriod.from)} to{" "}
              {day(view.lastPeriod.to)}). It can go to debt.
            </p>
          ) : null}
        </div>
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold">
              {p.view === "month" || !p.byPayday ? "This month's pay" : "This paycheck"}
            </h2>
            <span className="tnum text-sm text-muted">
              {money(view.incomeCents)} in
            </span>
          </div>
          <ol className="mt-2 divide-y divide-line">
            {steps.map((s, i) => (
              <li key={s.label} className="flex gap-3 py-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-ink">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-3 text-sm">
                    <span>{s.label}</span>
                    <b className="tnum">{money(s.cents)}</b>
                  </span>
                  <span className="block text-xs text-muted">{s.note}</span>
                </span>
              </li>
            ))}
          </ol>
          {late && d.neededCents ? (
            <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
              The 0% ends {monthYear(d.endsOn!)}. Clearing it by then takes{" "}
              {money(d.neededCents)} each {p.byPayday ? "payday" : "month"}.
            </p>
          ) : null}
          {view.planShortCents > 0 ? (
            <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
              These steps need {money(view.planShortCents)} more than the
              income, before any flexible spending.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            {view.incomeSource === "bank"
              ? "Income is from recent deposits; add it to the plan for a steadier figure. "
              : ""}
            <Link
              href="/insights/envelopes"
              className="font-semibold text-accent-text hover:underline"
            >
              Set up the spending plan
            </Link>
            {view.unplaced
              ? ` · ${view.unplaced} categor${view.unplaced === 1 ? "y isn't" : "ies aren't"} in a budget yet`
              : ""}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PaydayPlanCard view={view} />
        <LeftPaceChart view={view} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(["ESSENTIAL", "PLANNED", "FLEXIBLE"] as Tier[]).map((tier) => {
          const rows = view.groups.filter((g) => g.tier === tier);
          if (!rows.length) return null;
          return (
            <Card key={tier}>
              <h2 className="text-base font-bold">{TIER_TITLE[tier].title}</h2>
              <p className="mt-0.5 text-xs text-muted">
                {TIER_TITLE[tier].note}
              </p>
              <ul className="mt-1 divide-y divide-line">
                {rows.map((e) => (
                  <EnvelopeRow key={e.id} e={e} daysShare={daysShare} />
                ))}
              </ul>
              {tier === "FLEXIBLE" ? (
                <p className="flex justify-between gap-3 border-t border-line pt-2 text-sm font-semibold">
                  <span>Flexible left</span>
                  <span className="tnum">
                    {money(Math.max(0, view.flexibleLeftCents))}
                  </span>
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HistoryBars view={view} />
        <DebtChart view={view} />
      </div>

      <Limits view={view} />
    </section>
  );
}
