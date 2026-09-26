# Budget

Self-hosted budget planning for recurring bills and income.

It replaces the annual spreadsheet: line items are defined once and carry
forward every year, monthly amounts can be adjusted without disturbing the
plan, and the bills account is projected forward so you can see how much can
safely leave it today.

Everything runs on your own server against your own PostgreSQL database.

> **Status:** early. The data model, migrations, and container pipeline are in
> place. The interface is being built.

## What it does

- **Line items that persist.** Name, kind, category, the account it is paid
  from, planned amount, approximate due day, and which months it applies to.
  Nothing is recreated in January.
- **Per-month adjustments.** When a bill is going to run higher than usual,
  change that one month. The plan behind it stays put.
- **Bills carry until paid.** An unpaid item does not vanish at month end. It
  keeps its original due date, is flagged as overdue, and stays in the totals
  until it is settled or explicitly marked as nothing due.
- **Two halves for planning.** The month splits at a fixed day you choose, so
  you can see what lands before and after mid-month. Individual items can be
  pinned to either half when the due date is not how you actually pay it.
- **Cash projection.** Given the current balance, the bills still owed, and the
  paydays ahead, the app walks the account forward day by day and reports the
  lowest point it reaches. That number is how much can go out today without
  causing a shortfall later — including the cluster of fixed bills that lands at
  the start of the next month.
- **History.** Actuals are kept per month per item, so year-over-year reporting
  works once there is data to report on.

## Requirements

- PostgreSQL 14 or newer (18 recommended)
- Docker

## Setup

### 1. Create a database

The app needs its own database and user:

```sh
docker exec -it <your-postgres-container> psql -U postgres
```

```sql
CREATE USER budget WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE budget OWNER budget;
```

### 2. Run the container

```sh
docker run -d \
  --name budget \
  -p 8643:3000 \
  -e DATABASE_URL="postgresql://budget:choose-a-strong-password@<postgres-host>:5432/budget?schema=public" \
  -e TZ="UTC" \
  -e AUTH_MODE="proxy" \
  -v /path/to/appdata/budget:/app/data \
  ghcr.io/thorin29/budget:latest
```

If PostgreSQL also runs in Docker, put both containers on the same network and
use the database container's name as the host.

Migrations apply automatically on start, so upgrading is just pulling a newer
image.

### 3. Configure

Open `http://<host>:8643`. Setup walks through accounts, categories, line
items, and the pay calendar. Nothing is pre-populated — every account name,
category, and bill is yours to enter.

## Configuration

| Variable               | Required | Description                                                      |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| `DATABASE_URL`         | yes      | PostgreSQL connection string                                     |
| `TZ`                   | no       | Local timezone for due dates and projections. Defaults to UTC.    |
| `PORT`                 | no       | Port inside the container. Defaults to `3000`.                    |
| `PUID` / `PGID`        | no       | Ownership for files in the data volume. Defaults to `99:100`.     |
| `DATA_DIR`             | no       | Where uploads and backups are written. Defaults to `/app/data`.   |
| `AUTH_MODE`            | no       | `proxy` or `none`. Defaults to `proxy`.                           |
| `AUTH_HEADER`          | no       | Header carrying the authenticated user. Defaults to `Remote-User`.|
| `DEFAULT_SPLIT_DAY`    | no       | Day the planning split falls on. Defaults to `15`.                |
| `DEFAULT_HORIZON_DAYS` | no       | Days the projection looks ahead. Defaults to `45`.                |
| `AUTO_RECONCILE_SCHEMA`| no       | Reconcile the database against the schema on start. Defaults `true`.|

See `.env.example` for the full list.

### Unraid

`unraid-template.xml` can be imported directly. Replace the repository field
with your own image, set `DATABASE_URL`, and point the data volume at your
appdata share.

## A note on security

The app has no login of its own. `AUTH_MODE=proxy` trusts an authenticating
reverse proxy to have already identified the user, which is the intended
deployment. `AUTH_MODE=none` disables that check entirely and is only
appropriate on a trusted network.

Do not expose this without real authentication in front of it.

## Privacy

This repository contains no financial data, account names, institution names,
or payment links. Accounts, categories, and line items are created at runtime
and live only in your database. Any example or screenshot in this repository
uses synthetic values.

`.gitignore` excludes spreadsheets, database dumps, and the import directory so
source workbooks cannot be committed by accident.

## Development

```sh
npm install
cp .env.example .env      # point DATABASE_URL at a local PostgreSQL
npx prisma generate
npx prisma migrate deploy
npm run dev
```

The initial migration in `prisma/migrations/0000_init` was written by hand. The
container reconciles the database against `prisma/schema.prisma` on every start,
so a discrepancy corrects itself rather than requiring intervention. Set
`AUTO_RECONCILE_SCHEMA=false` to manage the schema manually.

## Tech

Next.js 15 (App Router) · TypeScript · Prisma 7 · PostgreSQL · Tailwind CSS

## License

MIT
