# Budget

Self-hosted budget planning for recurring bills and income.

It replaces the annual spreadsheet: line items are defined once and carry
forward every year, monthly amounts can be adjusted without disturbing the
plan, and the bills account is projected forward so you can see how much can
safely leave it today.

Everything runs on your own server against your own PostgreSQL database.

> **Status:** v0.5.0 — setup, line items and the month view work. The cash
> projection interface and the spreadsheet import are next. See `CHANGELOG.md`.

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
  --network <your-reverse-proxy-network> \
  -e DATABASE_URL="postgresql://budget:choose-a-strong-password@<postgres-host>:5432/budget?schema=public" \
  -e TZ="UTC" \
  -v /path/to/appdata/budget:/app/data \
  ghcr.io/thorin29/budget:latest
```

Note the absence of `-p`. The container is reached through the reverse proxy on
the shared network, not through a published port — see [Security](#security).
Put PostgreSQL on a network the container can also reach, and use the database
container's name as the host.

Migrations apply automatically on start, so upgrading is just pulling a newer
image.

### 3. Configure

Open the hostname you routed to it through the proxy. Setup walks through accounts, categories, line
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
| `DEFAULT_SPLIT_DAY`    | no       | Day the planning split falls on. Defaults to `15`.                |
| `DEFAULT_HORIZON_DAYS` | no       | Days the projection looks ahead. Defaults to `45`.                |

See `.env.example` for the full list.

### Unraid

`unraid-template.xml` can be imported directly. Replace the repository field
with your own image, set `DATABASE_URL`, and point the data volume at your
appdata share.

Set the network to your reverse proxy's Docker network and leave the host port
empty. The template marks the port optional for that reason.

## Security

**This application has no authentication.** Not a login, not a token, not a
header check. Anything that can open a TCP connection to it has full access to
your financial data.

That is a deliberate choice, and it means the security boundary is network
topology rather than application code:

```
browser → reverse proxy → authentication → budget (internal network only)
```

The container belongs on the reverse proxy's Docker network with **no host port
published**. The proxy is then the only route in, and there is no address that
reaches the application without passing authentication first.

Publishing a host port creates an address that reaches the application without
passing the proxy.

An application-level check was considered and rejected: a username header set by
a proxy is forgeable by anything that can reach the container directly, so it
only appears to solve the problem, and defending it properly means a shared
secret and a configuration contract between proxy and application. Not
publishing the port solves it outright with nothing to maintain.

### Running it directly during development

`npm run dev` on a workstation is fine — it is reachable only from that machine.
The same is true of a container bound to `127.0.0.1`. Neither needs the proxy.

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
node --env-file=.env node_modules/.bin/prisma generate
node --env-file=.env node_modules/.bin/prisma migrate deploy
npm run dev
```

Prisma 7 does not load `.env` automatically. Either use `--env-file` as above or
export `DATABASE_URL` into the shell before running any `prisma` command.

Startup runs `prisma migrate deploy` only. Drift between the database and
`prisma/schema.prisma` is detected and logged, never corrected automatically —
inspect it with:

```sh
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --script
```

Run the tests with `npm test`, and the type check with `npm run typecheck`. CI
runs both before an image is built.

## Versioning

The running version is shown at the bottom of the interface and returned by
`/api/health`, stamped with the commit it was built from. `CHANGELOG.md` records
what changed in each one.

## Design decisions

`DECISIONS.md` records the choices behind the data model and deployment, and
what is still open.

## Tech

Next.js 16 (App Router) · TypeScript · Prisma 7 · PostgreSQL · Tailwind CSS ·
Node 24

## License

MIT
