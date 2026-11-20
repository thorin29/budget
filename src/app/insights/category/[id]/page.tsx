import Link from "next/link";
import { middleOf } from "@/lib/usual";
import { notFound } from "next/navigation";
import { getCategoryDetail } from "@/server/category-detail";
import { NotFoundError } from "@/server/errors";
import { formatCents } from "@/lib/money";
import { Card, PageHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

const money = (cents: number) => formatCents(cents);
const whole = (cents: number) => formatCents(Math.round(cents / 100) * 100).replace(/\.00$/, "");
const monthLabel = (year: number, month: number, style: "long" | "short" = "long") =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: style, ...(style === "long" ? { year: "numeric" } : {}), timeZone: "UTC" });
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const { id } = await params;
  const { m } = await searchParams;
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit" }).format(new Date());
  const period = m && /^\d{4}-\d{2}$/.test(m) ? m : now;
  const [year, month] = period.split("-").map(Number);
  let detail;
  try {
    detail = await getCategoryDetail(id, year, month);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const max = Math.max(1, ...detail.months.map((x) => x.cents));
  const prior = detail.months.slice(-4, -1);
  const average = middleOf(prior.map((x) => x.cents));
  const thisMonth = detail.months[detail.months.length - 1]?.cents ?? 0;
  const yearTotal = detail.months.reduce((s, x) => s + x.cents, 0);

  return (
    <div className="space-y-6">
      <Link href={`/insights?m=${period}`} className="text-sm text-muted hover:text-foreground">
        ← Insights
      </Link>
      <PageHeading
        title={detail.name}
        description={`${money(thisMonth)} in ${monthLabel(year, month)} · ${whole(average)} usually (the middle of the three months before) · ${whole(yearTotal)} over these 12 months`}
      />

      {detail.id === null ? (
        <Card>
          <p className="text-sm">
            These charges have no category, so they can&rsquo;t be budgeted.{" "}
            <Link href="/insights/uncategorized" className="font-semibold text-accent-text hover:underline">
              Sort them by merchant
            </Link>
            : one choice per merchant settles every charge from it, or marks it as paying a bill (giving, a doctor) so it stops counting as spending.
          </p>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-base font-bold">Each Month</h2>
        <div role="img" aria-label={`${detail.name} by month`}>
          <div className="flex h-40 items-end gap-2">
            {detail.months.map((x, i) => (
              <div key={`${x.year}-${x.month}`} className="flex h-full flex-1 flex-col justify-end" title={`${monthLabel(x.year, x.month)}: ${money(x.cents)}`}>
                <span
                  className="mx-auto w-full max-w-11 rounded-t bg-accent"
                  style={{ height: `max(${(Math.max(0, x.cents) / max) * 100}%, ${x.cents > 0 ? 2 : 0}px)`, opacity: i === detail.months.length - 1 ? 1 : 0.55 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2 text-center">
            {detail.months.map((x, i) => (
              <div key={`${x.year}-${x.month}`} className="flex-1">
                <span className={`block text-xs ${i === detail.months.length - 1 ? "font-semibold text-foreground" : "text-muted"}`}>{monthLabel(x.year, x.month, "short")}</span>
                <span className="tnum block text-[11px] text-muted">{whole(x.cents)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-bold">Merchants This Month</h2>
          {detail.merchants.length ? (
            <ol className="mt-3 divide-y divide-line text-sm">
              {detail.merchants.map((x) => (
                <li key={x.merchant} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {x.merchant}
                    {x.count > 1 ? <span className="ml-1.5 text-xs text-muted">×{x.count}</span> : null}
                  </span>
                  <span className="tnum shrink-0 text-right">
                    <span className="font-semibold">{money(x.cents)}</span>
                    <span className="ml-2 text-xs text-muted">usually {whole(x.averageCents)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing this month.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-bold">Charges This Month</h2>
          {detail.charges.length ? (
            <ul className="mt-3 divide-y divide-line text-sm">
              {detail.charges.map((x) => (
                <li key={x.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{x.merchant}</span>
                    <span className="block text-xs text-muted">
                      {short(x.postedOn)} · {x.account}
                    </span>
                  </span>
                  <span className={`tnum shrink-0 font-semibold ${x.cents < 0 ? "text-ok" : ""}`}>{x.cents < 0 ? `refund ${money(-x.cents)}` : money(x.cents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing this month.</p>
          )}
          <Link href={`/transactions?category=${detail.id ?? "none"}`} className="mt-3 inline-block text-xs font-semibold text-accent-text hover:underline">
            All of them in Transactions
          </Link>
        </Card>
      </div>
    </div>
  );
}
