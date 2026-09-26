# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org):
the minor number moves when features land, the patch number for fixes.

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
