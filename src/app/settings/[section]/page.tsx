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
import { listCsvImports } from "@/server/bank/csv-import";
import { syncHour } from "@/lib/bank-schedule";
import { BillsSource, ConnectBank, CsvImporter, DeleteBankData, RevertImport, SyncControls } from "../bank";

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
        <h3 className="font-sans text-base font-bold">Your phones</h3>
        <p className="mt-1 text-sm text-muted">
          Each phone has its own sign-in. Signing one out stops it at once; changing your password signs out all of
          them.
        </p>
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
          <p className="mt-3 text-sm text-subtle">No phones yet.</p>
        )}
        <div className="mt-4">
          <AddPhone />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-sans text-base font-bold">Sessions</h3>
        <p className="mt-1 text-sm text-muted">
          Lost a phone or signed in somewhere you shouldn&rsquo;t have? This ends every session of yours — this
          browser, other browsers and your phones.
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
      <SectionHeading title="Appearance" description="Saved in this browser, so a phone and a desktop can differ." />

      <h3 className="font-sans text-[13px] font-semibold">Accent</h3>
      <p className="mt-0.5 text-xs text-muted">The same six as the phone app. Each phone picks its own under More → Appearance.</p>
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
  const [accounts, settings, feed] = await Promise.all([listAccounts(), getSettings(), listBankAccounts()]);
  const bankAccounts = accounts.filter((a) => a.kind === "BANK");
  const sources = feed.filter((a) => !a.hidden && (a.type === "CHECKING" || a.type === "SAVINGS"));
  const current = feed.find((a) => a.isBillsSource)?.id ?? "";

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
      {settings.billsAccountId && sources.length ? (
        <Card className="mt-6 p-6">
          <h3 className="font-sans text-base font-bold">Bills balance from your bank</h3>
          <p className="mb-4 mt-1 max-w-prose text-sm text-muted">
            The bills balance every figure starts from. With a bank account chosen, it updates every morning after
            the sync and you never type it.
          </p>
          <BillsSource
            current={current}
            options={sources.map((a) => ({ id: a.id, label: a.institution ? `${a.institution} · ${a.displayName}` : a.displayName }))}
          />
        </Card>
      ) : null}
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
        title="Paid-from accounts"
        description="The accounts your bills are paid from, as line items name them. Your bank feed's accounts are on the Accounts page; these will merge into them in a later version."
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

// ---------------------------------------------------------------- bank sync

const stamp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function Bank() {
  const key = configuredKey();
  const [connection, accounts, imports] = await Promise.all([getConnection(), listBankAccounts(), listCsvImports()]);
  const shown = accounts.filter((a) => !a.hidden && !a.dormant).length;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Bank sync"
        description="Optional. Reads balances and transactions once a day through a SimpleFIN bridge. Read-only: nothing here can move money."
      />

      {!key ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Turn it on</h3>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Bank sync needs an encryption key in the container settings, so the access link is never stored in the
            clear. Set <code className="rounded bg-neutral-soft px-1">BANK_SYNC_KEY</code> to a random string of at least 32
            characters (for example the output of <code className="rounded bg-neutral-soft px-1">openssl rand -base64 48</code>),
            restart, and come back here. Keep a copy: changing it later means connecting again.
          </p>
        </Card>
      ) : !connection ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Connect</h3>
          <p className="mb-4 mt-1 max-w-prose text-sm text-muted">
            In your bridge account, create a setup token for a new app and paste it here. Allowed bridges:{" "}
            {allowedHosts().join(", ")}.
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
                {connection.lastSuccessAt ? stamp.format(connection.lastSuccessAt) : "not yet"}. Syncs daily after{" "}
                {syncHour()}:00.
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
              <p className="mt-1 max-w-prose text-sm text-muted">
                {accounts.length} received, {shown} in use. They sort themselves by type; nothing to set up here.
              </p>
            </div>
            <Link href="/accounts" className="text-sm font-semibold text-accent-text hover:underline">
              Open Accounts
            </Link>
          </div>
        </Card>
      ) : null}

      {accounts.length ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Export</h3>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Everything the feed and your files have delivered, as CSV, for your own analysis or a backup. It downloads
            from your server to this browser.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/transactions/export?what=transactions" className="rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-semibold transition hover:bg-neutral-soft">
              Transactions.csv
            </a>
            <a href="/transactions/export?what=accounts" className="rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-semibold transition hover:bg-neutral-soft">
              Accounts.csv
            </a>
          </div>
        </Card>
      ) : null}

      {accounts.length ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Load past history from CSV</h3>
          <p className="mb-4 mt-1 max-w-prose text-sm text-muted">
            The feed only reaches back about 90 days. A transaction export from your bank&rsquo;s website fills in
            earlier months. Rows already here are skipped, and a file can be undone.
          </p>
          <CsvImporter
            accounts={accounts
              .filter((a) => !a.hidden)
              .map((a) => ({ id: a.id, label: a.institution ? `${a.institution} · ${a.displayName}` : a.displayName }))}
          />
          {imports.length ? (
            <ul className="mt-5 divide-y divide-line rounded-xl border border-line text-sm">
              {imports.map((b: { id: string; createdAt: Date; fileName: string | null; added: number; skipped: number; revertedAt: Date | null; account: { name: string } }) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <span>
                    <span className="font-medium">{b.fileName ?? "CSV file"}</span>
                    <span className="block text-xs text-muted">
                      {dateFormat.format(b.createdAt)} · {b.account.name} · {b.added} added, {b.skipped} skipped
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

      {accounts.length || connection ? (
        <Card className="p-6">
          <h3 className="font-sans text-base font-bold">Remove</h3>
          <p className="mb-4 mt-1 max-w-prose text-sm text-muted">
            Deletes every feed account, transaction and import, and the connection. Budget&rsquo;s own accounts and
            payments are not touched.
          </p>
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
      <p className="mt-5 max-w-prose text-sm text-muted">
        Self-hosted. Everything you enter stays in your own database, and fonts are bundled. The only
        outside requests are bank sync&rsquo;s, and only once you connect it. With BANK_SYNC_KEY set,
        identifying text is encrypted before it is stored, so a database backup alone can&rsquo;t read it.
        Keep a copy of the key: without it those fields can&rsquo;t be recovered.
      </p>
    </Card>
  );
}
