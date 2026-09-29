# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org):
the minor number moves when features land, the patch number for fixes.

## [0.9.2] — unreleased

### Added

- **An application icon.** Trimmed, squared and given a transparent rounded
  corner so it sits cleanly on a dark dashboard. `assets/icon.png` is what the
  Unraid template points at; the app serves it as its favicon, and a web manifest
  means an installed shortcut on a phone carries it too.

## [0.9.1] — unreleased

### Changed

- **Unpaid bills carry forward for one month, not twelve.** A bill left unpaid
  ten months ago is far more likely to be a missed entry than money still owed,
  and treating it as owed quietly reduced every available figure. The window is a
  preference — none, one, two, three, six or twelve months — and the month view
  states which is in force.
- 3 more tests covering the window.

### Notes

- Existing installs pick up the new default on their next start; nothing is
  deleted, and widening the window brings older gaps back into view.

## [0.9.0] — unreleased

Importing earlier years without disturbing the current one.

### Fixed

- **The projection counted phantom unpaid bills.** The same flaw fixed in the
  month view in 0.7.3 was still present here: every month outside the recorded
  data read as a pile of missed payments, which put the projected balance tens of
  thousands below reality. Only months containing a recorded payment can hold an
  unpaid bill.
- **Importing an older year would have overwritten the current year's line
  items.** Items match by name, and a match rewrote the planned amount, due day,
  schedule and payment link with the older workbook's values.
- **Two rows sharing a name in one document overwrote each other.** The second
  is now numbered, and the review screen flags it.

### Added

- **"Confine new line items to <year>"**, on by default. Anything created by the
  import starts and ends inside that year, so a bill that no longer exists stays
  in its own history instead of appearing as due in every current month. Turn it
  off when importing the year you are currently budgeting.
- **"Rewrite line items that already exist"**, off by default. Off means an
  existing item keeps its definition and the import contributes only that year's
  figures.
- 3 more tests covering the bounds applied to historical items.

## [0.8.1] — unreleased

### Changed

- **Inputs have their own colour.** Controls were drawn in the page background,
  which was fine when that was near-white and wrong once it was darkened — every
  field disappeared into the panel behind it. A separate `--field` token, close
  to the card white, now backs every input, select and the file picker.
- **"Nothing due this month" and "Mark unpaid" are filled buttons**, tinted to
  their meaning and inverting on hover, rather than plain text that read as
  incidental.
- The quiet button variant is filled too, so it reads as a control on a card.

## [0.8.0] — unreleased

### Changed

- **The month view is two columns.** Income and both halves sit together on one
  white card down the left; the balance and the two transfer figures stack in a
  column to their right, and follow as the page scrolls.
- **Income is at the top**, above the halves, matching the spreadsheet it
  replaces.
- **A darker page background**, so the white cards read as raised.
- **The balance field formats as currency** — a dollar sign and thousands
  separators while idle, plain digits while being edited, so the separators never
  interfere with typing.
- **A "Today" button** sits between the month arrows and returns to the current
  month. It is marked as current when you are already on it.
- The month total moved to the foot of the card, and the carried-bills section
  sits beneath it.

## [0.7.5] — unreleased

### Changed

- **Month rows look expandable.** A row was a button with nothing to suggest it,
  so the editor behind it — record what was paid, adjust the month, mark nothing
  due — was invisible. Rows now carry a disclosure arrow that turns when open, a
  hover highlight, and a hint naming what opening it does.
- "Nothing due this month" is a button rather than a bare link.

## [0.7.4] — unreleased

### Fixed

- **Entering a bills balance before choosing a bills account failed silently.**
  The balance has nowhere to be stored until a bank account is nominated in
  preferences, and the month view reported that as six words of red text beside
  the field, then discarded what had been typed. The month view now explains the
  missing step and links to it, and the field keeps its value when a save fails.
- **Settling a bill that cost nothing was undiscoverable.** The carried-bills
  section now says how: record zero, or mark the month as nothing due.

### Changed

- The setup overview notes that preferences gates the transfer figures.

## [0.7.3] — unreleased

### Fixed

- **Carryover invented unpaid bills for months that were never tracked.** The
  sweep looked twelve months back and treated any month without a recorded
  payment as a missed one — including months before the first payment exists and
  after the last. A freshly imported year produced dozens of phantom overdue
  bills dated before the data began. Only months containing at least one recorded
  payment can now hold an unpaid bill.
- **Carried bills are no longer mixed into the month.** They sit in their own
  collapsed section beneath it, so the halves show one month and nothing else.
  Their total is stated on the summary line and still counts toward the first
  half's remaining, since an overdue bill is owed now.

## [0.7.2] — unreleased

### Fixed

- **Import was unreachable from a fresh install.** The link appeared on the home
  page only once an account existed, and the setup screens did not link to it at
  all — so it was hidden in precisely the situation it exists for. Import is now
  a tab in setup, offered on the empty home page, and suggested on the setup
  overview while steps remain.

## [0.7.1] — unreleased

### Fixed

- The import set a line item's schedule from a bare ternary, which TypeScript
  widens to `string` and the generated Prisma client rejects for an enum column.
  Annotated explicitly.

## [0.7.0] — unreleased

Importing a year from a converted workbook.

### Added

- **`/import`** takes a JSON document converted from a spreadsheet and shows a
  plan before writing anything: which accounts and categories it would create,
  every line item with its amounts and counts, and what it could not read.
- **Review before applying.** Any line item can be excluded, its kind changed,
  and each new account marked as a bank account or a card. Reading a file writes
  nothing.
- **Imports are batches.** Each one is recorded and can be undone whole: the
  actuals it wrote are removed, along with anything it created that has not been
  used since. Rows that already existed are left alone, since there is no record
  of what they said before.
- **Re-running is safe.** Accounts, categories and line items match by name, so
  a second import updates rather than duplicating.
- **`/api/v1/import`** with `preview`, `apply` and `revert`.
- 4 more tests covering amount fidelity through the import path.

### Notes

- Workbook parsing happens outside the application, so no spreadsheet library
  appears in the dependency tree and source workbooks never reach the server.
- Months are taken from which budget columns carry a value, not from a frequency
  label — in practice the two disagree, and the columns are the truth.
- Pay dates found in a workbook are reported but not imported. A pay calendar
  generates them from a single date.

## [0.6.0] — unreleased

The cash projection — the side calculations, done by the application.

### Added

- **`/projection`** answers one question: how much can leave the bills account
  today. It walks the balance forward day by day, subtracting each unpaid bill on
  its due date and adding each expected paycheck, and reports the lowest point
  reached. That figure, less any buffer, is what is safe to pay.
- **The ledger behind the number.** Every day with activity is listed with its
  events and closing balance, and the low point is highlighted — so the
  constraint is visible rather than asserted, and it is obvious which bill or
  date causes it.
- **What-if.** Type a payment and the whole projection recomputes with it
  included; the horizon is adjustable from the same place.
- **Income on a pay calendar.** An income line item can name a pay schedule, and
  the projection then places one arrival on every payday that schedule generates.
  A month with three paydays produces three arrivals without a third line item —
  replacing the stacked income rows the spreadsheet needed. Migration `0002`.
- **`/api/v1/projection`**, accepting a proposed payment and a horizon.
- 2 more tests: that a three-payday month generates three arrivals, and that the
  extra check lifts the safe-to-pay figure by a full paycheck when the low point
  falls after it.

### Notes

- The horizon defaults to 45 days because it must reach past the next payday into
  the following month's fixed bills. Stopping at the next paycheck is what makes
  a payment look affordable when it is not.

## [0.5.0] — unreleased

The month view — the screen this project set out to replace.

### Added

- **`/month`** opens the current month; `/month/2026/9` opens any other, with
  arrows either side. Items are grouped into the two halves, each showing what is
  budgeted, what has been paid, and what remains.
- **Recording an actual.** Open a row and type what was paid. Its presence
  settles the item.
- **Adjusting one month.** Set a different budget for a single month without
  touching the plan behind it — for when a bill is known to be running higher.
  Adjusted rows are marked, and the plan is shown alongside.
- **"Nothing due this month"** for a card with no balance owing. Distinct from
  an amount of zero, and it removes the item from remaining.
- **Carried-forward bills.** An unpaid item from an earlier month appears with
  its original due date and a marker naming the month it came from, and a banner
  counts them.
- **The bills balance and both transfer figures.** Enter what is currently set
  aside and the screen shows what is free after the first half, and after both —
  cumulative, as in the spreadsheet.
- **Payment links** open from the row they belong to.
- **`/api/v1/months/{year}/{month}`** returns the same view as JSON.
- 6 more tests covering the remaining calculation, month overrides, halves,
  carryover, skipped months, and the two transfer figures.

### Fixed

- **Paying less than budgeted no longer leaves a phantom balance owing.** The
  spreadsheet subtracted actuals from budgets, so a $350 payment against a $400
  budget still showed $50 outstanding. Remaining now counts the budgeted amount
  of items that are not yet settled, and a settled item contributes nothing.

## [0.4.0] — unreleased

Line items. The budget can now be described in full; the month view is next.

### Added

- **Line items** at `/line-items` — create, edit, list, remove. Name, kind,
  category, the account it is paid from, planned amount, approximate due day,
  and how often it recurs.
- **Schedules beyond monthly.** Quarterly, twice-yearly, yearly and one-off are
  described by picking a starting month; the months they cover are derived, so
  the stated frequency and the stored month set cannot drift apart. "Specific
  months" remains for anything irregular.
- **Half-of-month pinning.** Auto follows the due day; an item can be pinned to
  either half when it is paid on a different rhythm than its due date implies.
- **Start and end months**, both empty by default. Ending an item leaves earlier
  months intact; deactivating hides it everywhere. The two are independent.
- **Payment links and notes** per item, stored only in the database.
- **`/api/v1/line-items`** with the same response contract as the rest.
- 6 more tests covering schedule month derivation, including anchors that wrap
  the year.

### Changed

- Schedule arithmetic moved to `src/lib/schedule.ts`, free of database imports,
  so it can be tested without a client or a connection.

### Notes

- Removing a line item that has actuals or month overrides deactivates it
  instead, so past months keep their meaning.

## [0.3.0] — unreleased

Setup. The application can now be configured; line items come next.

### Added

- **Setup screens** at `/setup` — accounts, categories, the pay calendar, and
  preferences, with an overview showing what is still outstanding. Nothing is
  pre-filled.
- **Accounts.** Bank, credit card, cash or other. A card may name the account
  that settles it, which is recorded for reporting and never affects the cash
  calculation.
- **Categories**, kept deliberately thin — a name and an order.
- **Pay calendar.** Weekly, fortnightly, twice-monthly or monthly. A fortnightly
  schedule needs one known payday and generates the rest, so a year of dates
  comes from a single row. Each screen previews the next six paydays it
  produces, so a schedule can be checked against reality before it is relied on.
  Schedules are versioned by the date they took effect rather than edited.
- **Preferences.** The bills account, the day the month splits on, the projection
  horizon, and an optional floor to keep in the account.
- **`/api/v1`** for accounts, categories, pay schedules and settings, with a
  fixed response contract: create and update return the complete record, and
  errors share one envelope with field-level issues.
- **A domain layer** under `src/server`. Pages and route handlers call it; it
  owns validation and talks to the database. Neither touches Prisma directly.
- 13 more tests covering pay date generation across year boundaries and short
  months, month halves, due-month rules, and carryover of unpaid bills.

### Notes

- Deleting an account or category that is still referenced deactivates it
  instead, so history keeps its meaning.

## [0.2.0] — unreleased

Foundational pass before interface work. No new features; the ground the
features will stand on.

### Changed

- **Money is integer cents throughout the domain layer.** The projection engine
  previously used JavaScript `number`, fed by a `Decimal(12,2)` column. All
  monetary fields are renamed with a `Cents` suffix. See `src/lib/money.ts`.
- **Next.js 16.3.6 (Active LTS).** Next 15's security support ends 21 October
  2026. The `eslint` key is removed from the Next config, which 16 ignores.
- **Node 24** across the image and declared in `engines`.
- **Prisma pinned exactly** — CLI, client and adapter all 7.10.0, matching the
  version installed in the runtime image. Prisma 8 remains a release candidate;
  moving to it is a pre-1.0 task.
- **Startup applies migrations only.** The automatic `db push` reconciliation is
  gone. Drift is detected and logged, never silently corrected.
- **`PeriodAssignment` reduced to `AUTO`, `FIRST`, `SECOND`.** Migration `0001`.
- The Unraid template marks the host port optional; the `docker run` example
  reaches the container through the reverse proxy network instead.

### Added

- **Tests.** 20 covering the projection engine and cent arithmetic — overdue
  bills, same-day events, month and year boundaries, horizon edges, buffers,
  proposed payments, shortfalls, and exact-cent accumulation.
- **CI gates publishing.** Typecheck and tests run first; the image is not built
  or pushed if either fails. Pull requests run verification without publishing.
- **Architecture invariants** in `DECISIONS.md`, including that the security
  boundary is network topology and the application holds no authentication of
  its own.

### Notes

- `npm audit` reports six findings, all in the Prisma CLI's dependencies and
  Vitest's mocker. Build and development only; none are in the runtime path.
- Lint is not yet wired up. Next 16 removed `next lint`, and rather than guess at
  a flat-config shape, CI gates on typecheck and tests for now.

## [0.1.4] — unreleased

### Fixed

- The Prisma CLI is linked into the application's `node_modules` at image build
  time. `prisma.config.ts` imports `prisma/config`, which Node resolves relative
  to the config file, and the CLI is installed outside the app directory to keep
  it clear of the standalone bundle — so migrations could not load their config.

## [0.1.3] — unreleased

### Fixed

- The build creates `public/` rather than assuming the repository contains it.
  Git does not track empty directories, so a project without static assets left
  the final image assembly with nothing to copy.

## [0.1.2] — unreleased

### Fixed

- The Prisma client is created on first use rather than at module load. Next
  evaluates route modules while collecting page data during the build, where no
  database is reachable, so constructing eagerly failed the build instead of
  surfacing a missing `DATABASE_URL` at runtime.

## [0.1.1] — unreleased

### Fixed

- Enum types are imported from the generated `enums` module. The `prisma-client`
  generator emits `client`, `enums`, `models` and `commonInputTypes` rather than
  a single root index, so importing from the output directory itself failed the
  type check.
- The build no longer imports `package.json` through an import attribute, which
  depended on how the Next config is transpiled. The version is read from disk.

## [0.1.0] — unreleased

First working container. No interface yet beyond a status page.

### Added

- Data model covering accounts, categories, line items, per-month budget
  overrides, actuals, balance snapshots, and the pay calendar.
- Month model: halves split at a fixed day, per-item half pinning, schedule
  handling for monthly through annual and arbitrary month sets, and carryover of
  unpaid bills across month boundaries.
- Cash projection engine: walks the bills account forward day by day and reports
  the lowest balance reached, what is committed before the next payday, and how
  much can safely leave the account today.
- Container pipeline: multi-stage build, GitHub Actions publishing to GHCR,
  Unraid template, and an entrypoint that applies migrations and reconciles the
  database against the schema on start.
- Health endpoint at `/api/health` reporting status, database reachability, and
  the running version.
- Version shown in the interface and stamped with the build commit.

### Notes

- The application has no authentication of its own. See `DECISIONS.md`.
