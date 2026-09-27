import Link from "next/link";
import { getProjection } from "@/server/projection-view";
import { formatCents } from "@/lib/money";
import { versionLabel } from "@/lib/version";
import { Card, EmptyState } from "@/components/ui";
import { WhatIf } from "./what-if";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function ProjectionPage({
  searchParams,
}: {
  searchParams: Promise<{ pay?: string; days?: string }>;
}) {
  const query = await searchParams;
  const proposed = query.pay ? Math.round(Number(query.pay) * 100) : undefined;
  const horizonDays = query.days ? Number(query.days) : undefined;

  const view = await getProjection({
    proposedPaymentCents:
      proposed && Number.isFinite(proposed) && proposed > 0 ? proposed : undefined,
    horizonDays:
      horizonDays && Number.isFinite(horizonDays) && horizonDays >= 7
        ? horizonDays
        : undefined,
  });

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          Budget
        </Link>
        <Link href="/month" className="text-sm text-muted hover:text-foreground">
          This month
        </Link>
      </div>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">What can I pay?</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Your bills account walked forward {view.horizonDays} days. The lowest point it
        reaches is the constraint — anything above it can leave today.
      </p>

      {view.balanceMissing ? (
        <div className="mt-6">
          <EmptyState>
            No balance recorded yet. Enter what is currently set aside on the month
            view and these figures become meaningful.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Card className={view.shortfall ? "border-danger" : "border-accent"}>
              <p className="text-xs text-muted">Safe to pay today</p>
              <p className="tnum mt-1 text-2xl font-semibold">
                {formatCents(view.safeToPayCents)}
              </p>
              {view.shortfall ? (
                <p className="mt-1 text-xs text-danger">
                  Already short — the balance goes negative before the horizon ends.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Keeps the low point at or above{" "}
                  {formatCents(view.bufferCents)}
                </p>
              )}
            </Card>

            <Card>
              <p className="text-xs text-muted">Lowest point</p>
              <p className="tnum mt-1 text-2xl font-semibold">
                {formatCents(view.lowPoint.balanceCents)}
              </p>
              <p className="mt-1 text-xs text-muted">on {fmtDate(view.lowPoint.date)}</p>
            </Card>

            <Card>
              <p className="text-xs text-muted">Due before the next payday</p>
              <p className="tnum mt-1 text-2xl font-semibold">
                {formatCents(view.committedBeforeNextPayCents)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {view.nextPayDate
                  ? `next on ${fmtDate(view.nextPayDate)}`
                  : "no payday in this window"}
              </p>
            </Card>
          </div>

          <div className="mt-4">
            <WhatIf
              currentPay={query.pay ?? ""}
              horizonDays={view.horizonDays}
              safeToPayCents={view.safeToPayCents}
            />
          </div>

          <section className="mt-8">
            <h2 className="mb-2 text-sm font-medium text-muted">
              Day by day, from {formatCents(view.openingBalanceCents)}
            </h2>

            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {view.days.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  Nothing scheduled in this window.
                </p>
              ) : (
                view.days.map((day) => {
                  const isLow = day.date.getTime() === view.lowPoint.date.getTime();
                  return (
                    <div
                      key={day.date.toISOString()}
                      className={`flex gap-3 border-t border-line px-4 py-2.5 first:border-t-0 ${
                        isLow ? "bg-accent-soft" : ""
                      }`}
                    >
                      <span className="tnum w-16 shrink-0 text-xs text-muted">
                        {fmtDate(day.date)}
                      </span>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        {day.events.map((event, i) => (
                          <div key={i} className="flex justify-between gap-3 text-sm">
                            <span
                              className={`truncate ${
                                event.kind === "proposed" ? "text-accent" : ""
                              }`}
                            >
                              {event.name}
                            </span>
                            <span
                              className={`tnum shrink-0 ${
                                event.amountCents > 0 ? "text-accent" : "text-muted"
                              }`}
                            >
                              {formatCents(event.amountCents, { signed: true })}
                            </span>
                          </div>
                        ))}
                      </div>

                      <span
                        className={`tnum w-28 shrink-0 text-right text-sm ${
                          day.balanceCents < 0
                            ? "text-danger"
                            : isLow
                              ? "font-semibold"
                              : ""
                        }`}
                      >
                        {formatCents(day.balanceCents)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}

      <footer className="mt-12 text-xs text-muted">{versionLabel()}</footer>
    </div>
  );
}
