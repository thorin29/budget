import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { listAccounts, ACCOUNT_KINDS } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { listPaySchedules, previewPayDates, PAY_FREQUENCIES } from "@/server/pay-schedule";
import { payFromDeposits } from "@/server/pay-detect";
import { usePayFromDepositsAction } from "../../setup/actions";
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
import { Card, SectionHeading, buttonClass } from "@/components/ui";
import { AccountsForm, AccountRow } from "../../setup/accounts/form";
import { CategoryForm, CategoryRow } from "../../setup/categories/form";
import { PayScheduleForm } from "../../setup/pay/form";
import { PeriodsForm, ScheduleCard } from "../pay-settings";
import { PreferencesForm } from "../../setup/preferences/form";
import { PlanningExtras } from "../../insights/settings/setup-panel";
import { cushionSetting } from "@/server/envelopes";
import { getMonthPlan } from "@/server/month-plan";
import { SETTING_KEYS } from "@/lib/settings";
import { Importer } from "../../import/importer";
import { setAppearanceAction } from "../actions";
import { SECTIONS, type SectionSlug } from "../sections";
import { currentUser, listUsers } from "@/server/auth";
import { MAX_USERS } from "@/lib/auth/rules";
import {
  AddPhone,
  ChangePasswordForm,
  InviteSecondPerson,
  RemoveUser,
  RevokeDevice,
  SignOutEverywhere,
} from "../security";
import { listDevices } from "@/server/device-auth";
import { configuredKey } from "@/lib/secret-box";
import { allowedHosts } from "@/lib/simplefin";
import { formatCents } from "@/lib/money";
import { getConnection } from "@/server/bank/sync";
import { listBankAccounts } from "@/server/bank/accounts";
import { amazonStatus } from "@/server/amazon-import";
import { listCsvImports } from "@/server/bank/csv-import";
import { SLOT_MINUTE, syncHours } from "@/lib/bank-schedule";
import { AmazonImporter, BillsSource, CombinedImporter, ConnectBank, CsvImporter, LinkAccountToBank, DeleteBankData, RawFeed, RevertImport, SyncControls } from "../bank";

export const dynamic = "force-dynamic";

export default async function SettingsSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  // Pages that moved: categories live with budgets now.
  if (section === "categories") redirect("/settings/budgets?item=categories");
  if (section === "planning") redirect("/settings/pay");
  if (!SECTIONS.some((s) => s.slug === section)) notFound();

  switch (section as SectionSlug) {
    case "security":
      return <Security />;
    case "appearance":
      return <Appearance />;
    case "pay":
      return <Pay />;
    case "bank":
      return <Bank />;
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
  const devices = me ? await listDevices(me.id) : [];
  const others = users.filter((u) => u.id !== me?.id);

  return (
    <div className="space-y-6">
      <SectionHeading title="User Accounts" description={`Up to ${MAX_USERS} users; full edit permissions for both.`} />

      <Card className="p-6">
        <h3 className="font-sans text-base font-bold">Your Password</h3>
        <p className="mt-1 text-sm text-muted">
          Signed in as <strong className="text-foreground">{me?.username}</strong>.
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-sans text-base font-bold">Signed-In Devices</h3>
        {devices.length ? (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold">{d.name}</span>
                  <span className="block text-xs text-muted">
                    Added {dateFormat.format(d.createdAt)}
                    {d.lastSeenAt ? ` · last used ${dateFormat.format(d.lastSeenAt)}` : ""} · sign-in lasts until{" "}
                    {dateFormat.format(d.expiresAt)}
                  </span>
                </span>
                <RevokeDevice deviceId={d.id} name={d.name} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-subtle">No devices yet.</p>
        )}
        <div className="mt-4">
          <AddPhone />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-sans text-base font-bold">Sessions</h3>
        <p className="mt-1 text-sm text-muted">Ends every session of yours, here and on your devices.</p>
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
            <p className="mb-3 text-sm text-muted">One-time code, good for 15 minutes.</p>
            <InviteSecondPerson />
          </div>
        ) : others.length ? (
          <p className="mt-3 text-xs text-muted">Both users are set up. Remove one to invite someone else.</p>
        ) : null}
        <p className="mt-5 text-xs text-muted">
          Forgotten password: <code className="rounded bg-neutral-soft px-1">node scripts/reset-password.mjs &lt;username&gt;</code> in the container.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- appearance

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "cobalt", label: "Cobalt" },
  { value: "violet", label: "Violet" },
  { value: "graphite", label: "Graphite" },
  { value: "forest", label: "Forest" },
  { value: "plum", label: "Plum" },
  { value: "teal", label: "Teal" },
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
      <SectionHeading title="Appearance" />

      <h3 className="font-sans text-[13px] font-semibold">Accent</h3>
      <form action={setAppearanceAction} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
              {/* A miniature of the safe-to-send card in that accent. */}
              <div data-theme={option.value} className="bg-background p-3 text-foreground">
                <div className="rounded-lg bg-hero p-2.5 text-hero-text">
                  <p className="text-[10px] text-hero-muted">Safe to send today</p>
                  <p className="font-heading tnum text-base font-bold">$412.00</p>
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
                  <span className="h-3 w-3 rounded-full bg-accent" />
                  <span className="h-1.5 flex-1 rounded bg-neutral-soft" />
                  <span className="rounded-full bg-accent-soft px-1.5 text-[9px] font-semibold text-accent-ink">Paid</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 bg-surface px-3 py-2.5">
                <span className="text-sm font-semibold">{option.label}</span>
                {active ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">In use</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </form>

      <h3 className="mt-7 font-sans text-[13px] font-semibold">Light or Dark</h3>
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

// ---------------------------------------------------------------- pay

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every two weeks",
  SEMI_MONTHLY: "Twice a month",
  MONTHLY: "Monthly",
};

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const FREQUENCY_WORDS: Record<string, string> = { WEEKLY: "every week", BIWEEKLY: "every two weeks", SEMI_MONTHLY: "twice a month", MONTHLY: "once a month" };

async function Pay() {
  const [schedules, fromBank, settings, incomes, splitRow] = await Promise.all([
    listPaySchedules(),
    payFromDeposits(),
    getSettings(),
    prisma.lineItem.findMany({ where: { kind: "INCOME", active: true }, select: { id: true, name: true, payScheduleId: true }, orderBy: { name: "asc" } }) as Promise<Array<{ id: string; name: string; payScheduleId: string | null }>>,
    prisma.setting.findUnique({ where: { key: SETTING_KEYS.splitSchedule } }) as Promise<{ value: unknown } | null>,
  ]);
  const today = new Date();
  const horizonEnd = new Date(today.getTime() + 120 * 86_400_000);
  const splitSchedule = typeof splitRow?.value === "string" ? splitRow.value : null;
  const live = schedules.filter((s) => !s.activeTo);
  const ended = schedules.filter((s) => s.activeTo);
  const unlinked = incomes.filter((i) => !i.payScheduleId).map((i) => ({ id: i.id, name: i.name }));
  const card = (schedule: (typeof schedules)[number]) => (
    <ScheduleCard
      key={schedule.id}
      schedule={schedule}
      frequencyLabel={FREQUENCY_LABELS[schedule.frequency]}
      upcoming={previewPayDates(schedule, today, horizonEnd).slice(0, 6)}
      paychecks={incomes.filter((i) => i.payScheduleId === schedule.id).map((i) => ({ id: i.id, name: i.name }))}
      unlinked={unlinked}
    />
  );

  return (
    <div className="space-y-5">
      <SectionHeading title="Pay Settings" />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="space-y-3">
          <h3 className="font-sans text-base font-bold">Employers &amp; Pay Schedules</h3>
          {fromBank && !fromBank.matches ? (
            <form action={usePayFromDepositsAction} className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-soft px-3 py-2 text-sm">
              <span>
                Deposits show pay {FREQUENCY_WORDS[fromBank.detected.frequency]}
                {fromBank.detected.daysOfMonth.length ? ` (the ${fromBank.detected.daysOfMonth.map((d) => (d >= 28 ? "last day" : ordinal(d))).join(" and ")})` : ""}.
              </span>
              <button type="submit" className={buttonClass("primary")}>
                Use this
              </button>
            </form>
          ) : null}
          {live.length === 0 ? <p className="text-sm text-muted">No pay schedules yet.</p> : null}
          {live.map(card)}
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-accent-text">+ Add an employer</summary>
            <div className="mt-3">
              <PayScheduleForm frequencies={PAY_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))} />
            </div>
          </details>
          {ended.length ? (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-muted">Ended ({ended.length})</summary>
              <div className="mt-2 space-y-2">{ended.map(card)}</div>
            </details>
          ) : null}
        </Card>
        <Card className="space-y-3">
          <h3 className="font-sans text-base font-bold">Tracker Periods</h3>
          <PeriodsForm mode={settings.splitMode} splitDay={settings.splitDay} scheduleId={splitSchedule} schedules={live.map((s) => ({ id: s.id, name: s.name }))} />
        </Card>
      </div>
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
        <SectionHeading title="Import & Export" />
        <Importer batches={batches} />
      </div>

      <Card>
        <h3 className="font-sans text-base font-bold">Export</h3>

        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/transactions/export?what=transactions" className="rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-semibold transition hover:bg-neutral-soft">
            Transactions.csv
          </a>
          <a href="/transactions/export?what=accounts" className="rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-semibold transition hover:bg-neutral-soft">
            Accounts.csv
          </a>
        </div>
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

// ---------------------------------------------------------------- bank sync

const stamp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function Bank() {
  const key = configuredKey();
  const [connection, accounts, imports, amazon] = await Promise.all([getConnection(), listBankAccounts(), listCsvImports(), amazonStatus()]);
  const shown = accounts.filter((a) => !a.hidden && !a.dormant).length;

  return (
    <div className="space-y-6">
      <SectionHeading title="Bridge Connectivity (optional)" />

      {!key ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Turn It On</h3>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Set <code className="rounded bg-neutral-soft px-1">BANK_SYNC_KEY</code> (32+ characters, e.g.{" "}
            <code className="rounded bg-neutral-soft px-1">openssl rand -base64 48</code>) in the container and restart. Keep a copy.
          </p>
        </Card>
      ) : !connection ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Connect</h3>
          <p className="mb-4 mt-1 max-w-prose text-sm text-muted">
            Paste a setup token from your bridge ({allowedHosts().join(", ")}).
          </p>
          <ConnectBank />
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-sans text-base font-bold">Connected</h3>
              <p className="mt-1 text-sm text-muted">
                Through {connection.host}. Last good sync:{" "}
                {connection.lastSuccessAt ? stamp.format(connection.lastSuccessAt) : "not yet"}. Syncs at{" "}
                {syncHours().map((h) => `${h}:${String(SLOT_MINUTE).padStart(2, "0")}`).join(", ")}.
              </p>
            </div>
            <Link href="/transactions" className="text-sm font-semibold text-accent-text hover:underline">
              View transactions
            </Link>
          </div>
          {connection.lastError ? (
            <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{connection.lastError}</p>
          ) : null}
          {connection.messages.length ? (
            <div className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
              <p className="font-semibold">The bridge reported:</p>
              <ul className="mt-1 list-disc pl-5">
                {connection.messages.map((m: string, i: number) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {accounts.some((a) => !a.hidden && !a.dormant) ? (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Bank Data As Of</h4>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
                {accounts
                  .filter((a) => !a.hidden && !a.dormant)
                  .map((a) => {
                    const stale = a.balanceDate ? Date.now() - a.balanceDate.getTime() > 36 * 3_600_000 : true;
                    return (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
                        <span className="min-w-0 truncate">{a.institution ? `${a.institution} · ${a.displayName}` : a.displayName}</span>
                        <span className={`text-xs ${stale ? "font-semibold text-warn" : "text-muted"}`}>
                          {a.balanceDate ? stamp.format(a.balanceDate) : "not yet"}
                          {stale && a.balanceDate ? " · over a day old" : ""}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
          <div className="mt-4">
            <SyncControls />
          </div>
        </Card>
      )}

      {accounts.length ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-sans text-base font-bold">Accounts</h3>
              <p className="mt-1 text-sm text-muted">
                {accounts.length} received, {shown} in use
              </p>
            </div>
            <Link href="/settings/accounts" className="text-sm font-semibold text-accent-text hover:underline">
              Open Accounts
            </Link>
          </div>
        </Card>
      ) : null}

      {accounts.length && connection ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Check the Raw Feed</h3>
          <p className="mb-3 mt-1 text-sm text-muted">One account&rsquo;s last 30 days, every field. Counts toward the daily limit.</p>
          <RawFeed
            accounts={accounts
              .filter((a) => !a.hidden)
              .map((a) => ({ id: a.id, label: a.institution ? `${a.institution} · ${a.displayName}` : a.displayName }))}
          />
        </Card>
      ) : null}


      {accounts.length ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Load Past History from CSV</h3>
          <p className="mb-4 mt-1 text-sm text-muted">For months before the feed&rsquo;s 90 days. Duplicates are skipped.</p>
          <CsvImporter
            accounts={accounts
              .filter((a) => !a.hidden)
              .map((a) => ({ id: a.id, label: a.institution ? `${a.institution} · ${a.displayName}` : a.displayName }))}
          />
          <details className="mt-5 rounded-xl border border-line p-4">
            <summary className="cursor-pointer text-sm font-semibold">One File for Several Accounts</summary>
            <p className="mb-3 mt-2 text-xs text-muted">Needs an Account ID (or Institution and Account) column; Category is optional.</p>
            <CombinedImporter />
          </details>
          {imports.length ? (
            <ul className="mt-5 divide-y divide-line rounded-xl border border-line text-sm">
              {imports.map((b: { id: string; createdAt: Date; fileName: string | null; added: number; skipped: number; revertedAt: Date | null; account: { name: string; nickname?: string | null } }) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <span>
                    <span className="font-medium">{b.fileName ?? "CSV file"}</span>
                    <span className="block text-xs text-muted">
                      {dateFormat.format(b.createdAt)} · {b.account.nickname || b.account.name} · {b.added} added, {b.skipped} skipped
                      {b.revertedAt ? " · undone" : ""}
                    </span>
                  </span>
                  {!b.revertedAt ? <RevertImport importId={b.id} /> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {accounts.length ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Amazon Orders</h3>
          <p className="mb-4 mt-1 text-sm text-muted">
            Splits each Amazon charge by what was in it. Amazon → Request your data → Your Orders, then <b>Order History.csv</b>.
          </p>
          <AmazonImporter status={{ charges: amazon.charges, lastImportAt: amazon.lastImportAt ? amazon.lastImportAt.toISOString() : null }} />
        </Card>
      ) : null}

      {accounts.length || connection ? (
        <Card className="border-danger p-6">
          <h3 className="font-sans text-base font-bold text-danger">Danger Zone</h3>
          <p className="mb-4 mt-1 text-sm text-muted">Budget&rsquo;s own accounts and payments stay.</p>
          <DeleteBankData />
        </Card>
      ) : null}
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
        <dt className="text-muted">Encryption</dt>
        <dd>
          {configuredKey() ? (
            <span className="font-semibold text-ok">On</span>
          ) : (
            <span className="font-semibold text-warn">Off — set BANK_SYNC_KEY</span>
          )}
          <span className="block text-xs text-muted">
            Bank account and institution names, merchants, descriptions, memos, notes and payment links
          </span>
        </dd>
        <dt className="text-muted">API</dt>
        <dd>
          <a href="/api/v1/meta" className="text-accent-text hover:underline">
            /api/v1/meta
          </a>
        </dd>
      </dl>

    </Card>
  );
}
