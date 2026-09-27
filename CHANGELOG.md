# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org):
the minor number moves when features land, the patch number for fixes.

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
