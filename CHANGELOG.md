# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org):
the minor number moves when features land, the patch number for fixes.

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
