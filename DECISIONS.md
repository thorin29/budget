# Decisions

A running record of choices that shaped this project, and the reasoning behind
them, so a future change is made deliberately rather than by accident.

---

## Open

### AUTH_MODE is not yet set to `proxy`

**Status:** deferred, revisit before regular use.

The application has no login of its own. `AUTH_MODE=proxy` trusts an
authenticating reverse proxy to have identified the user and reads the name from
the header named in `AUTH_HEADER`. `AUTH_MODE=none` skips that check entirely.

The first deployment runs without `AUTH_MODE` set while the container is being
brought up and reached directly by IP on the LAN. Anyone who can reach the
mapped port is in, with no credentials.

**To close this:** put the app behind the reverse proxy with its authentication
middleware applied, then set `AUTH_MODE=proxy` and confirm the header arrives.
Do not expose the host port beyond the LAN until then.

---

## Settled

### TypeScript, not Python

The stack mirrors the household dashboard project already running on the same
server — Next.js, TypeScript, Prisma, PostgreSQL, Tailwind — so both share one
toolchain, one deployment shape, and one set of build failures to learn.

Python was the alternative, and its advantage was spreadsheet parsing. That
advantage was removed by keeping the spreadsheet importer outside the
application: source workbooks are converted to JSON separately and the app
ingests JSON, so no spreadsheet library appears in the dependency tree.

### Every line item is a cash obligation

An earlier design treated card-charged items as tracked-but-not-cash, on the
theory that only the card's own payment needed money in the bank. That was
wrong. Each line item is paid from an account and every one of them requires
real money.

`chargedTo` remains on the model as reporting metadata — it records which card a
charge lands on — but it never affects what must be in the bank.

### Bills carry forward until paid

The spreadsheet this replaces silently forgets an unpaid bill at month end. Here
an unpaid item keeps its original due date, is flagged, and stays in the totals
until settled or explicitly marked as not due for that month.

`skipped` on `MonthlyPlan` is how "nothing owed this month" is recorded. It is
deliberately distinct from an amount of zero.

### The month splits at a fixed day, not at a payday

An earlier version derived the halves from the pay calendar. It produced
lopsided periods — a four-day second half in some months — because paydays drift
while bills stay pinned to days of the month.

The split is a planning guideline set once, defaulting to the 15th. Paydays are
a reference calendar the projection uses; no boundary or total derives from them.
Individual items can be pinned to either half where the due date is not how the
bill is actually paid.

### The projection is the point

The month view shows what is owed. The projection answers the question that was
previously worked out by hand each month: given the balance now, the bills still
outstanding, and the paydays ahead, how much can leave the account today.

It walks the balance forward day by day and reports the lowest point reached. The
horizon extends past the next payday on purpose — stopping there hides the
cluster of fixed bills that lands at the start of the following month.

### An actual entry is the paid flag

One actual per line item per month, and its existence means settled. No separate
checkbox to keep in sync. If per-charge detail is ever wanted, dropping the
unique constraint and adding a date turns the same table into a transaction log.

### Prisma 7 configuration

Prisma 7 removed `url` from the datasource block and requires a driver adapter.
The connection string lives in `prisma.config.ts`, read from `process.env`
directly rather than through Prisma's `env()` helper, which throws when the
variable is unset and would break `prisma generate` during the image build.

The generator is `prisma-client` with an explicit output path;
`prisma-client-js` is deprecated.

### The container reconciles its own schema

The initial migration was written by hand. Rather than leave that as a trap, the
entrypoint applies migrations, then diffs the live database against the schema
and reconciles any difference with `db push` — without `--accept-data-loss`, so
nothing destructive can run unattended. `AUTO_RECONCILE_SCHEMA=false` disables it.

### No data in the repository

The repository is public. It contains no account names, institution names,
vendor names, payment links, or figures. Accounts, categories, and line items are
created at runtime. `.gitignore` excludes spreadsheets, dumps, and the import
directory so source workbooks cannot be committed by accident.
