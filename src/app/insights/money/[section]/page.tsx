/**
 * One expense line from the Money tab on its own page: bills, subscriptions & autopay, the debt
 * payment, charges that may be bills, or everyday spending. Everyday spending opens further, one
 * budget at a time.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { InsightsTabs } from "@/components/insights-tabs";
import { getMonthPlan } from "@/server/month-plan";
import { SUBSCRIPTIONS, unbilledRepeats } from "@/server/subscriptions";
import { getEnvelopeSetup } from "@/server/envelopes";
import { Card } from "@/components/ui";
import { MonthPicker, TabHeading, pickMonth, monthLabel } from "../../shared";
import { RepeatActions } from "../repeat-actions";
import { ChargeActions, type BillChoice, type CategoryChoice } from "../charge-actions";
import { BADGE, BillList, SpendingChart, TIERS, day, exact, isSub, monthName, paidBills, payState, sumBills } from "../parts";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  bills: "Bills",
  subscriptions: SUBSCRIPTIONS,
  debt: "Debt payment",
  "maybe-bills": "Charges that may be bills",
  everyday: "Everyday spending",
};

function Head({ title, cents, note, badge }: { title: string; cents: number; note?: string; badge?: string }) {
  const b = badge ? BADGE[badge] : null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        {note ? <p className="text-sm text-muted">{note}</p> : null}
      </div>
      <span className="flex items-center gap-2">
        {b ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${b.cls}`}>{b.label}</span> : null}
        <b className="tnum text-lg">{exact(cents)}</b>
      </span>
    </div>
  );
}

export default async function MoneySectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ section }, { m }] = await Promise.all([params, searchParams]);
  if (!TITLES[section]) notFound();
  const picked = pickMonth(m);
  const [plan, repeats, setup] = await Promise.all([
    getMonthPlan(picked.year, picked.month),
    section === "maybe-bills" && picked.isNow ? unbilledRepeats().catch(() => []) : Promise.resolve([]),
    section === "maybe-bills" ? getEnvelopeSetup().catch(() => null) : Promise.resolve(null),
  ]);
  const long = monthLabel(picked.year, picked.month, "long");
  let body: ReactNode;

  if (section === "bills" || section === "subscriptions") {
    const rows = plan.bills.items.filter((b) => (section === "subscriptions" ? isSub(b) : !isSub(b)));
    const total = sumBills(rows);
    body = (
      <Card>
        <Head
          title={TITLES[section]}
          cents={total}
          badge={rows.length ? payState(paidBills(rows), total) : undefined}
          note={`${exact(paidBills(rows))} paid · ${long}${rows.some((b) => b.status === "overdue") ? " · some overdue" : ""}`}
        />
        <div className="mt-3">
          <BillList rows={rows} />
        </div>
      </Card>
    );
  } else if (section === "debt") {
    const d = plan.debt;
    body = (
      <Card>
        <Head title={`Debt payment${d.name ? `: ${d.name}` : ""}`} cents={d.cents} badge={d.cents ? (d.source === "paid" ? "paid" : "due") : undefined} note={long} />
        <dl className="mt-3 divide-y divide-line text-sm">
          {d.dueOn ? (
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted">Due</dt>
              <dd>{day(d.dueOn)}</dd>
            </div>
          ) : null}
          {d.balanceCents !== null ? (
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted">Balance</dt>
              <dd className="tnum">{exact(d.balanceCents)}</dd>
            </div>
          ) : null}
          {d.targetCents ? (
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted">Monthly to clear it{d.endsOn ? ` by ${day(d.endsOn)}` : ""}</dt>
              <dd className="tnum">{exact(d.targetCents)}</dd>
            </div>
          ) : null}
        </dl>
        <Link href={`/insights/debt`} className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">
          Debt tab ›
        </Link>
      </Card>
    );
  } else if (section === "maybe-bills") {
    const billOptions = plan.bills.items.filter((b, i, all) => b.status !== "skipped" && all.findIndex((x) => x.lineItemId === b.lineItemId && x.from === b.from) === i);
    const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const choicesFor = (t: (typeof plan.bills.other)[number]): BillChoice[] => {
      const tw = words(t.name);
      return billOptions
        .map((b) => ({
          id: b.lineItemId,
          name: b.from ? `${b.name} (${monthName(b.from)})` : b.name,
          ym: b.from,
          suggested: (!!t.category && b.category === t.category) || [...words(b.name)].some((w) => tw.has(w)) || Math.abs(b.cents - t.cents) <= 50,
        }))
        .sort((x, y) => Number(y.suggested) - Number(x.suggested) || x.name.localeCompare(y.name));
    };
    const everyday: CategoryChoice[] = (setup?.groups ?? [])
      .filter((g) => g.tier !== "BILLS")
      .flatMap((g) => g.categories.map((c) => ({ id: c.id, name: c.name, group: g.name })));
    body = (
      <Card>
        <Head title={TITLES[section]} cents={plan.bills.otherCents} badge="actual" note="In a bill category but not on the bill list, or repeating every month" />
        {plan.bills.other.length || repeats.length ? (
          <ul className="mt-3 divide-y divide-line text-sm">
            {plan.bills.other.map((t, i) => (
              <li key={`${t.id}:${i}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="tnum text-xs text-muted">{day(t.date)}</span> {t.name}
                  {t.pending ? <span className="text-muted"> · pending</span> : null}
                </span>
                {t.cents > 0 && !t.split && !t.pending ? <ChargeActions txnId={t.id} bills={choicesFor(t)} categories={everyday} /> : null}
                <span className="tnum w-24 shrink-0 text-right">{exact(t.cents)}</span>
              </li>
            ))}
            {repeats.map((r) => (
              <li key={r.merchantKey} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate">
                  {r.merchant} <span className="text-xs text-muted">· repeats: about {exact(r.typicalCents)} around day {r.typicalDay}, {r.months} months · {r.account}</span>
                </span>
                <RepeatActions merchantKey={r.merchantKey} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">None this month.</p>
        )}
      </Card>
    );
  } else {
    body = (
      <>
        <Card>
          <Head title={TITLES[section]} cents={plan.spentCents} badge="actual" note={long} />
          <div className="mt-4">
            <SpendingChart groups={plan.groups} month={plan.month} />
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          {TIERS.map(({ tier, label }) => {
            const groups = plan.groups.filter((g) => g.tier === tier && g.spentCents !== 0).sort((a, b) => b.spentCents - a.spentCents);
            if (!groups.length) return null;
            return (
              <Card key={tier}>
                <p className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted">
                  <span>{label}</span>
                  <span className="tnum">{exact(groups.reduce((t, g) => t + g.spentCents, 0))}</span>
                </p>
                <ul className="mt-1 divide-y divide-line text-sm">
                  {groups.map((g) => (
                    <li key={g.id}>
                      <Link href={`/insights/money/budget/${encodeURIComponent(g.id)}?m=${plan.month}`} className="flex justify-between gap-3 py-2 font-semibold hover:underline">
                        <span>{g.name} ›</span>
                        <span className="tnum">{exact(g.spentCents)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <InsightsTabs right={<MonthPicker path={`/insights/money/${section}`} year={picked.year} month={picked.month} />} />
      <TabHeading title={TITLES[section]} />
      <Link href={`/insights/money?m=${plan.month}`} className="inline-block text-sm text-muted hover:text-foreground">
        ← Money
      </Link>
      {body}
    </div>
  );
}
