import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getProjection } from "@/server/projection-view";
import { toCents } from "@/lib/money";
import { EmptyState, PageHeading } from "@/components/ui";
import { Explorer, type ExplorerDay } from "./what-if";

export const dynamic = "force-dynamic";

const HORIZONS = [30, 45, 60, 90];

export default async function ProjectionPage({
  searchParams,
}: {
  searchParams: Promise<{ pay?: string; days?: string }>;
}) {
  const query = await searchParams;
  const horizonDays = query.days ? Number(query.days) : undefined;

  const [view, surplusItem] = await Promise.all([
    getProjection({
      horizonDays:
        horizonDays && Number.isFinite(horizonDays) && horizonDays >= 7 && horizonDays <= 365
          ? horizonDays
          : undefined,
    }),
    prisma.lineItem.findFirst({
      where: { active: true, paidFromSurplus: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true, plannedAmount: true },
    }) as Promise<{ name: string; plannedAmount: { toString(): string } } | null>,
  ]);

  const initialPay = query.pay ? Math.round(Number(query.pay) * 100) : 0;

  const start = Date.UTC(view.asOf.getUTCFullYear(), view.asOf.getUTCMonth(), view.asOf.getUTCDate());
  const days: ExplorerDay[] = view.days.map((d) => ({
    date: d.date.toISOString().slice(0, 10),
    offset: Math.round((d.date.getTime() - start) / 86_400_000),
    balanceCents: d.balanceCents,
    events: d.events.map((e) => ({ name: e.name, amountCents: e.amountCents, kind: e.kind })),
  }));

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link href="/month" className="mb-2 inline-block text-sm text-muted hover:text-foreground">
        ← Tracker
      </Link>
      <PageHeading
        title="What can I pay?"
        description={`Your ${view.billsAccountName ?? "bills"} balance walked forward day by day. The lowest point it reaches is the limit — anything above it can leave today.`}
        action={
          <nav className="flex rounded-xl border border-line bg-surface p-1 text-sm shadow-card" aria-label="Days ahead">
            {HORIZONS.map((h) => (
              <Link
                key={h}
                href={`/projection?days=${h}`}
                aria-current={h === view.horizonDays ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  h === view.horizonDays
                    ? "bg-accent-soft text-accent-ink"
                    : "text-muted hover:bg-neutral-soft hover:text-foreground"
                }`}
              >
                {h} days
              </Link>
            ))}
          </nav>
        }
      />

      {view.balanceMissing ? (
        <EmptyState>
          No balance recorded yet. Enter what is in the bills account on{" "}
          <Link href="/month" className="font-semibold text-accent-text hover:underline">
            this month
          </Link>{" "}
          and these figures come to life.
        </EmptyState>
      ) : (
        <Explorer
          asOf={view.asOf.toISOString().slice(0, 10)}
          horizonDays={view.horizonDays}
          openingBalanceCents={view.openingBalanceCents}
          bufferCents={view.bufferCents}
          safeToPayCents={view.safeToPayCents}
          lowPoint={{
            date: view.lowPoint.date.toISOString().slice(0, 10),
            balanceCents: view.lowPoint.balanceCents,
          }}
          committedBeforeNextPayCents={view.committedBeforeNextPayCents}
          nextPayDate={view.nextPayDate ? view.nextPayDate.toISOString().slice(0, 10) : null}
          days={days}
          initialPayCents={Number.isFinite(initialPay) && initialPay > 0 ? initialPay : 0}
          payee={
            surplusItem
              ? { name: surplusItem.name, plannedCents: toCents(surplusItem.plannedAmount) }
              : null
          }
        />
      )}
    </div>
  );
}
