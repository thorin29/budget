import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { listAccounts, ACCOUNT_KINDS } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { listPaySchedules, previewPayDates, PAY_FREQUENCIES } from "@/server/pay-schedule";
import { getSettings } from "@/server/settings";
import { listImportBatches } from "@/server/import";
import { prisma } from "@/lib/prisma";
import { toDecimalString } from "@/lib/money";
import { APP_VERSION, BUILD_SHA } from "@/lib/version";
import {
  MODE_COOKIE,
  THEME_COOKIE,
  readMode,
  readTheme,
  type Mode,
  type Theme,
} from "@/lib/appearance";
import { Card, SectionHeading } from "@/components/ui";
import { AccountsForm, AccountRow } from "../../setup/accounts/form";
import { CategoryForm, CategoryRow } from "../../setup/categories/form";
import { PayScheduleForm, PayScheduleRow } from "../../setup/pay/form";
import { PreferencesForm } from "../../setup/preferences/form";
import { Importer } from "../../import/importer";
import { setAppearanceAction } from "../actions";
import { SECTIONS, type SectionSlug } from "../sections";
import { currentUser, listUsers } from "@/server/auth";
import { MAX_USERS } from "@/lib/auth/rules";
import { ChangePasswordForm, InviteSecondPerson, RemoveUser, SignOutEverywhere } from "../security";

export const dynamic = "force-dynamic";

export default async function SettingsSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!SECTIONS.some((s) => s.slug === section)) notFound();

  switch (section as SectionSlug) {
    case "security":
      return <Security />;
    case "appearance":
      return <Appearance />;
    case "planning":
      return <Planning />;
    case "accounts":
      return <Accounts />;
    case "categories":
      return <Categories />;
    case "pay":
      return <Pay />;
    case "data":
      return <Data />;
    case "about":
      return <About />;
  }
}

// ---------------------------------------------------------------- security

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

async function Security() {
  const [me, users] = await Promise.all([currentUser(), listUsers()]);
  const others = users.filter((u) => u.id !== me?.id);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Sign-in & people"
        description={`Budget allows up to ${MAX_USERS} people. Both see and change everything; neither is in charge of the other.`}
      />

      <Card className="p-6">
        <h3 className="font-sans text-base font-bold">Your password</h3>
        <p className="mt-1 text-sm text-muted">
          Signed in as <strong className="text-foreground">{me?.username}</strong>. Changing the password signs out
          every other browser and device.
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-sans text-base font-bold">Sessions</h3>
        <p className="mt-1 text-sm text-muted">
          Lost a phone or signed in somewhere you shouldn&rsquo;t have? This ends every session of yours, this one
          included.
        </p>
        <div className="mt-4">
          <SignOutEverywhere />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-sans text-base font-bold">People</h3>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">{u.username}</span>
                {u.id === me?.id ? <span className="ml-2 text-xs text-muted">you</span> : null}
                <span className="block text-xs text-muted">
                  Added {dateFormat.format(u.createdAt)}
                  {u.lastSignInAt ? ` · last signed in ${dateFormat.format(u.lastSignInAt)}` : ""}
                </span>
              </span>
              {u.id !== me?.id ? <RemoveUser userId={u.id} username={u.username} /> : null}
            </li>
          ))}
        </ul>
        {users.length < MAX_USERS ? (
          <div className="mt-4">
            <p className="mb-3 text-sm text-muted">
              Add the second person with a one-time code. It lasts 15 minutes; they choose their own username and
              password.
            </p>
            <InviteSecondPerson />
          </div>
        ) : others.length ? (
          <p className="mt-3 text-xs text-muted">Both places are taken. Remove an account to invite someone else.</p>
        ) : null}
        <p className="mt-5 text-xs text-muted">
          Forgotten password: whoever runs the server can set a temporary one with{" "}
          <code className="rounded bg-neutral-soft px-1">node scripts/reset-password.mjs &lt;username&gt;</code>{" "}
          inside the container.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- appearance

const THEME_OPTIONS: Array<{ value: Theme; label: string; detail: string }> = [
  { value: "cool", label: "Cool", detail: "Crisp greys, green accent, geometric headings" },
  { value: "warm", label: "Warm", detail: "Paper tones, forest green, serif headings" },
];

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "system", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

async function Appearance() {
  const jar = await cookies();
  const theme = readTheme(jar.get(THEME_COOKIE)?.value);
  const mode = readMode(jar.get(MODE_COOKIE)?.value);

  return (
    <Card className="p-6">
      <SectionHeading title="Appearance" description="Saved in this browser, so a phone and a desktop can differ." />

      <h3 className="font-sans text-[13px] font-semibold">Theme</h3>
      <form action={setAppearanceAction} className="mt-2 grid gap-4 sm:grid-cols-2">
        {THEME_OPTIONS.map((option) => {
          const active = option.value === theme;
          return (
            <button
              key={option.value}
              type="submit"
              name="theme"
              value={option.value}
              aria-pressed={active}
              className={`overflow-hidden rounded-2xl border-2 text-left transition ${
                active ? "border-accent" : "border-line hover:border-line-strong"
              }`}
            >
              {/* A miniature of the month view in that theme. */}
              <div data-theme={option.value} className="bg-background p-4 text-foreground">
                <div className="flex gap-2">
                  <div className="flex-1 rounded-lg border border-line bg-surface p-2.5">
                    <p className="text-[10px] text-muted">Free after the month</p>
                    <p className="font-heading tnum text-base font-bold">$1,240.00</p>
                  </div>
                  <div className="flex-1 rounded-lg bg-hero p-2.5 text-hero-text">
                    <p className="text-[10px] text-hero-muted">Available to send</p>
                    <p className="font-heading tnum text-base font-bold">$860.00</p>
                  </div>
                </div>
                <div className="mt-2 space-y-1.5 rounded-lg border border-line bg-surface p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-accent" />
                    <span className="h-1.5 flex-1 rounded bg-neutral-soft" />
                    <span className="rounded-full bg-ok-soft px-1.5 text-[9px] font-semibold text-ok">Paid</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border-2 border-dashed border-line-strong" />
                    <span className="h-1.5 flex-1 rounded bg-neutral-soft" />
                    <span className="rounded-full bg-warn-soft px-1.5 text-[9px] font-semibold text-warn">Soon</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-muted">{option.detail}</span>
                </span>
                {active ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
                    In use
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </form>

      <h3 className="mt-7 font-sans text-[13px] font-semibold">Light or dark</h3>
      <form action={setAppearanceAction} className="mt-2 inline-flex rounded-[10px] bg-neutral-soft p-1">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="submit"
            name="mode"
            value={option.value}
            aria-pressed={option.value === mode}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              option.value === mode
                ? "bg-surface text-foreground shadow-card"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------- planning

async function Planning() {
  const [accounts, settings] = await Promise.all([listAccounts(), getSettings()]);
  const bankAccounts = accounts.filter((a) => a.kind === "BANK");

  return (
    <div>
      <SectionHeading
        title="Planning"
        description="Which balance the figures start from, where the month divides, and how far ahead the projection looks."
      />
      {bankAccounts.length === 0 ? (
        <Card>
          <p className="text-sm">
            Add a bank account first — the bills account has to be one.{" "}
            <Link href="/settings/accounts" className="font-semibold text-accent-text hover:underline">
              Go to accounts
            </Link>
          </p>
        </Card>
      ) : (
        <PreferencesForm
          bankAccounts={bankAccounts.map((a) => ({ id: a.id, name: a.name }))}
          settings={{
            splitDay: settings.splitDay,
            horizonDays: settings.horizonDays,
            buffer: toDecimalString(settings.bufferCents),
            carryMonths: settings.carryMonths,
            billsAccountId: settings.billsAccountId,
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- accounts

const ACCOUNT_LABELS: Record<string, string> = {
  BANK: "Bank account",
  CREDIT_CARD: "Credit card",
  CASH: "Cash",
  OTHER: "Other",
};

async function Accounts() {
  const accounts = await listAccounts({ includeInactive: true });
  const bankAccounts = accounts.filter((a) => a.kind === "BANK");

  return (
    <div>
      <SectionHeading
        title="Accounts"
        description="Every place money leaves from or lands on. A credit card can name the account that pays it off, for reporting only."
      />
      <AccountsForm
        kinds={ACCOUNT_KINDS.map((k) => ({ value: k, label: ACCOUNT_LABELS[k] }))}
        bankAccounts={bankAccounts.map((a) => ({ id: a.id, name: a.name }))}
      />
      <div className="mt-6 space-y-2">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">Nothing added yet.</p>
        ) : (
          accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              kindLabel={ACCOUNT_LABELS[account.kind]}
              settledByName={accounts.find((a) => a.id === account.settledById)?.name ?? null}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- categories

async function Categories() {
  const categories = await listCategories({ includeInactive: true });
  return (
    <div>
      <SectionHeading
        title="Categories"
        description="Groupings used by Year & reports. They can grow over time."
      />
      <CategoryForm />
      <div className="mt-6 space-y-2">
        {categories.length === 0 ? (
          <p className="text-sm text-muted">Nothing added yet.</p>
        ) : (
          categories.map((category) => <CategoryRow key={category.id} category={category} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pay

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every two weeks",
  SEMI_MONTHLY: "Twice a month",
  MONTHLY: "Monthly",
};

async function Pay() {
  const schedules = await listPaySchedules();
  const today = new Date();
  const horizonEnd = new Date(today.getTime() + 120 * 86_400_000);

  return (
    <div>
      <SectionHeading
        title="Pay calendar"
        description="When money is expected to arrive. The projection uses it; it does not decide how the month is divided."
      />
      <PayScheduleForm
        frequencies={PAY_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
      />
      <div className="mt-6 space-y-3">
        {schedules.length === 0 ? (
          <p className="text-sm text-muted">Nothing added yet.</p>
        ) : (
          schedules.map((schedule) => (
            <PayScheduleRow
              key={schedule.id}
              schedule={schedule}
              frequencyLabel={FREQUENCY_LABELS[schedule.frequency]}
              upcoming={previewPayDates(schedule, today, horizonEnd).slice(0, 6)}
            />
          ))
        )}
      </div>
      <p className="mt-6 max-w-prose text-xs text-muted">
        Add a second schedule rather than editing the first when your pay changes. Each records the
        date it took effect, so past months keep resolving against what was true at the time.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- data

async function Data() {
  const [batches, years] = await Promise.all([
    listImportBatches(),
    prisma.actualEntry.findMany({ distinct: ["year"], select: { year: true }, orderBy: { year: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading
          title="Import"
          description="Load a year from a converted workbook. Nothing is written until you have reviewed what it will do."
        />
        <Importer batches={batches} />
      </div>

      <Card>
        <h3 className="font-sans text-base font-bold">Export</h3>
        <p className="mt-1 text-sm text-muted">
          Every item by every month for a year, as CSV — budgeted and paid side by side.
        </p>
        {years.length === 0 ? (
          <p className="mt-3 text-sm text-subtle">Nothing recorded yet.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {years.map(({ year }: { year: number }) => (
              <a
                key={year}
                href={`/year/${year}/csv`}
                className="rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-semibold transition hover:bg-neutral-soft"
              >
                {year}.csv
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- about

function About() {
  return (
    <Card className="p-6">
      <SectionHeading title="About" />
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-muted">Version</dt>
        <dd className="tnum font-semibold">{APP_VERSION}</dd>
        <dt className="text-muted">Build</dt>
        <dd className="tnum">{BUILD_SHA ? BUILD_SHA.slice(0, 7) : "local"}</dd>
        <dt className="text-muted">API</dt>
        <dd>
          <a href="/api/v1/meta" className="text-accent-text hover:underline">
            /api/v1/meta
          </a>
        </dd>
      </dl>
      <p className="mt-5 max-w-prose text-sm text-muted">
        Self-hosted. Everything you enter stays in your own database; the app makes no outside
        requests, and fonts are bundled.
      </p>
    </Card>
  );
}
