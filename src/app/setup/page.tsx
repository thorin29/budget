import Link from "next/link";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { listPaySchedules } from "@/server/pay-schedule";
import { getSettings } from "@/server/settings";
import { Button, Card, PageHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SetupOverview() {
  const [accounts, categories, schedules, settings] = await Promise.all([
    listAccounts({ includeInactive: true }),
    listCategories({ includeInactive: true }),
    listPaySchedules(),
    getSettings(),
  ]);

  const steps = [
    {
      href: "/setup/accounts",
      label: "Accounts",
      done: accounts.length > 0,
      detail:
        accounts.length > 0
          ? `${accounts.length} added`
          : "Where money sits or is owed — one per bank account, card, or cash",
    },
    {
      href: "/setup/categories",
      label: "Categories",
      done: categories.length > 0,
      detail:
        categories.length > 0
          ? `${categories.length} added`
          : "Groupings for reporting later. A handful is plenty to start",
    },
    {
      href: "/setup/pay",
      label: "Pay calendar",
      done: schedules.length > 0,
      detail:
        schedules.length > 0
          ? `${schedules.length} schedule${schedules.length === 1 ? "" : "s"}`
          : "When money arrives, so the projection knows what is coming",
    },
    {
      href: "/setup/preferences",
      label: "Preferences",
      done: settings.billsAccountId !== null,
      detail: settings.billsAccountId
        ? `Split on the ${settings.splitDay}th, ${settings.horizonDays}-day horizon`
        : "The bills account, the month split, and how far ahead to look",
    },
  ];

  const remaining = steps.filter((s) => !s.done).length;

  return (
    <div>
      <PageHeading
        title="Setup"
        description={
          remaining === 0
            ? "Everything is configured. Line items are next."
            : "Four things to set up. Nothing is pre-filled — every name here is yours."
        }
      />

      <div className="grid gap-3">
        {steps.map((step) => (
          <Link key={step.href} href={step.href}>
            <Card className="transition hover:border-accent">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <h2 className="font-medium">{step.label}</h2>
                  <p className="mt-1 text-sm text-muted">{step.detail}</p>
                </div>
                <span
                  className={`shrink-0 text-xs ${step.done ? "text-accent" : "text-muted"}`}
                >
                  {step.done ? "Done" : "Not started"}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {remaining === 0 ? (
        <div className="mt-6">
          <Link href="/line-items">
            <Button>Go to line items</Button>
          </Link>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">
          Coming from a spreadsheet?{" "}
          <Link href="/import" className="text-accent hover:underline">
            Import a converted workbook
          </Link>{" "}
          and it will create the accounts, categories and line items for you.
        </p>
      )}
    </div>
  );
}
