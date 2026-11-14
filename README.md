# Budget

Self-hosted budget planning for recurring bills and income.

It replaces the yearly spreadsheet: line items are defined once and carry
forward every year, a single month can be adjusted without disturbing the plan,
and the bills account is projected forward so you can see how much can safely
leave it today.

Everything runs on your own server against your own PostgreSQL database. The app
makes no outside requests — fonts are bundled.

> **Status:** v0.12.0. Month view, cash projection, line items, year reports,
> import and export all work. Built-in sign-in is next. See `CHANGELOG.md`.

## What it does

- **This month.** Every bill grouped by half of the month, with income at the
  top and anything unpaid from last month called out. Four figures across the
  top: what is in the bills account, what is free after the first half, what is
  free after the month, and what is available for the item paid from what is
  left over.
- **Recording a payment always takes a confirmation.** Click a bill's amount, accept
  or change the figure and the date, then press Confirm. Or press ⌘K / Ctrl+K,
  type the item and the amount (`electric 172.40`), press Enter to review and
  Enter again to record. There is no one-click "paid" tick to hit by accident.
- **What can I pay?** The bills balance walked forward day by day over the next
  30–90 days. The lowest point it reaches is the limit; a slider shows what a
  payment today does to it.
- **Line items that persist.** Name, kind, category, the account it is paid
  from, usual amount, approximate due day, and which months it falls in. Nothing
  is recreated in January. Retiring an item keeps its history.
- **Bills carry until paid.** An unpaid item stays owed into the next month
  until it is settled or marked as nothing due.
- **Two halves for planning.** The month splits at a day you choose. Items can be
  pinned to either half.
- **Year & reports.** Every item by every month, budgeted beside paid, with
  monthly and category totals, a comparison with the year before, and a CSV
  download.
- **Import.** Load past years from a converted workbook, reviewed before anything
  is written, and undoable as a batch.
- **Two looks.** Cool or warm, each in light or dark, chosen per browser under
  Settings → Appearance.

## Requirements

- PostgreSQL 14 or newer (18 recommended)
- Docker

## Setup

### 1. Create a database

```sql
CREATE USER budget WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE budget OWNER budget;
```

### 2. Run the container

```sh
docker run -d \
  --name budget \
  -e DATABASE_URL="postgresql://budget:choose-a-strong-password@<postgres-host>:5432/budget?schema=public" \
  -e TZ="UTC" \
  -v /path/to/appdata/budget:/app/data \
  ghcr.io/thorin29/budget:latest
```

Migrations apply automatically on start, so upgrading is pulling a newer image.

### 3. Configure

Open the app and go to **Settings**: add accounts, categories and the pay
calendar, then choose the bills account under Planning. Add line items, or
import a workbook under Settings → Import & export. Nothing is pre-populated.

## Configuration

| Variable               | Required | Description                                                    |
| ---------------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`         | yes      | PostgreSQL connection string                                   |
| `TZ`                   | no       | Local timezone for due dates and projections. Defaults to UTC.  |
| `PORT`                 | no       | Port inside the container. Defaults to `3000`.                  |
| `PUID` / `PGID`        | no       | Ownership for files in the data volume. Defaults to `99:100`.   |
| `DATA_DIR`             | no       | Where uploads and backups are written. Defaults to `/app/data`. |
| `DEFAULT_SPLIT_DAY`    | no       | Day the planning split falls on. Defaults to `15`.              |
| `DEFAULT_HORIZON_DAYS` | no       | Days the projection looks ahead. Defaults to `45`.              |
| `FRAME_ANCESTORS`      | no       | Origins allowed to embed the app in a frame. Empty = none.      |

See `.env.example` for the full list.

### Unraid

`unraid-template.xml` can be imported directly. Set `DATABASE_URL` and point the
data volume at your appdata share.

## Security

The application has no login of its own yet; built-in sign-in arrives in 0.13.
Until then, put it behind something that authenticates — a reverse proxy with an
auth layer, a VPN, or a trusted network.

Already in place: a strict Content-Security-Policy with a fresh nonce on every
page, `nosniff` and `same-origin` referrer headers, payment links limited to
`http`/`https`, request size caps, and no image-optimizer endpoint. The
container runs as an unprivileged user. `DECISIONS.md` has the reasoning.

## Privacy

This repository contains no financial data, account names, institution names,
or payment links. Accounts, categories and line items are created at runtime and
live only in your database. Examples and tests use made-up values.

`.gitignore` excludes spreadsheets, database dumps, CSV exports and the import
directory so source data cannot be committed by accident.

## Development

```sh
npm install
cp .env.example .env      # point DATABASE_URL at a local PostgreSQL
node --env-file=.env node_modules/.bin/prisma generate
node --env-file=.env node_modules/.bin/prisma migrate deploy
npm run dev
```

Prisma 7 does not load `.env` automatically. Use `--env-file` as above or export
`DATABASE_URL` before running any `prisma` command.

Startup runs `prisma migrate deploy` only. Drift between the database and
`prisma/schema.prisma` is logged, never corrected automatically.

`npm test` runs the tests and `npm run typecheck` the type check. CI runs both
before an image is built.

`npm run preflight` generates the real Prisma client and type-checks against
it, even where Prisma's engine downloads are blocked, so a local type check
matches the one in the Docker build.

## Versioning

The running version is shown in the sidebar, under Settings → About, and by
`/api/v1/meta`. `/api/health` reports only whether the app and database are up.
`CHANGELOG.md` records what changed; `DECISIONS.md` keeps the current
toolchain versions and the upgrade routine.

## Tech

Next.js 16 (App Router) · TypeScript · Prisma 7 · PostgreSQL · Tailwind CSS 4 ·
Node 24

## License

MIT
