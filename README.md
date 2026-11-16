# Budget

Self-hosted budget planning for recurring bills and income.

It replaces the yearly spreadsheet: line items are defined once and carry
forward every year, a single month can be adjusted without disturbing the plan,
and the bills account is projected forward so you can see how much can safely
leave it today.

Everything runs on your own server against your own PostgreSQL database. Fonts
are bundled. The only outside requests are optional bank sync's, once you turn it
on.

> **Status:** v0.24.0. Month view, cash projection, line items, year reports,
> import, export, sign-in for up to two people, and a token-secured API for a
> phone app all work. See `CHANGELOG.md`.

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
- **Bank sync (optional).** Connect a SimpleFIN bridge and Budget pulls
  balances and transactions once a day, read-only. Each account is marked
  Spending, Balance only or Hidden; a bank account can keep the bills balance
  current. Merchant names are cleaned up, transfers between your own accounts
  are set aside, and past months load from a bank's CSV export. See
  [Bank sync](#bank-sync).
- **One look with the phone app.** Figtree type, Phosphor icons, and one of six
  accents (Cobalt by default) in light or dark, chosen per browser under
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

### 3. Create your account

The first visit asks you to create an account. It needs a **setup code**
written to the container's log when that page opens (look for "first-run setup
code"). The page closes for good once an account exists.

A second person can be added later from Settings → Sign-in & people with a
one-time code. Forgot a password? Inside the container run:

```sh
node scripts/reset-password.mjs <username>
```

It prints a temporary password and signs that account out everywhere.

### 4. Configure

Go to **Settings**: add accounts, categories and the pay
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
| `REAL_IP_HEADER`       | no       | Header your proxy puts the client IP in, for rate limits.       |
| `SESSION_SECRET`       | no       | Overrides the cookie-signing secret (32+ characters).           |
| `BANK_SYNC_KEY`        | no       | Encryption key (32+ characters). Turns on bank sync and encrypts identifying text. Keep a copy. |
| `BANK_SYNC_HOUR`       | no       | Local hour after which the daily bank sync runs. Defaults to 6. |
| `SIMPLEFIN_EXTRA_HOSTS`| no       | More SimpleFIN-compatible hosts to allow, comma-separated.      |

See `.env.example` for the full list.

### Unraid

`unraid-template.xml` can be imported directly. Set `DATABASE_URL` and point the
data volume at your appdata share.

## Security

Sign-in is built in and always on: up to two people, scrypt-hashed passwords,
signed session cookies, rate-limited sign-in, and a check in every server
action. Keep an authenticating proxy in front as well if the app is reachable
from outside; the app does not rely on it.

Identifying text is encrypted before it is stored when `BANK_SYNC_KEY` is set:
bank account and institution names, merchants, descriptions, memos, notes and
payment links (AES-256-GCM, a fresh IV per value). A database backup on its own
shows ciphertext for those fields. Amounts, dates and categories stay plain so
totals run in the database; without the names they identify no one. Losing the
key means losing those fields, so keep a copy somewhere safe.

Also in place: a strict Content-Security-Policy with a fresh nonce on every
page, `nosniff` and `same-origin` referrer headers, payment links limited to
`http`/`https`, request size caps, and no image-optimizer endpoint. The
container runs as an unprivileged user. `DECISIONS.md` has the reasoning.

### Exposing it

If you put Budget on the internet behind an authenticating proxy, let only
the phone API through without the proxy's sign-in, and nothing else:

```
^/api/v1([/?].*)?$   → bypass     (above the catch-all rule)
everything else   → your proxy's sign-in, two-factor recommended
```

Every `/api/v1` route checks a device token itself and never accepts the
browser's cookie; the build fails if a route forgets. Keep PostgreSQL
unreachable from outside the container network, and keep backups private:
they hold every figure and the cookie-signing secret.

## Phone API

`/api/v1` is for the phone app. Every route needs
`Authorization: Bearer <device token>` except these three:

| Route | Purpose |
| --- | --- |
| `GET /api/v1/meta` | App name, version and API version |
| `POST /api/v1/auth/login` | `{username, password}` → `{proof}`, valid five minutes |
| `POST /api/v1/auth/enroll` | `{proof, code, name}` → `{token, expiresAt, device}` |

The `code` comes from **Settings → Sign-in & people → Add a phone** on the web
(text or QR; 15 minutes, one use). A password alone cannot add a phone. The
token is returned once: store it in the Android Keystore. It lasts a year;
`POST /api/v1/auth/refresh` swaps it for a fresh one, `GET /api/v1/auth/me`
confirms it, and `POST /api/v1/auth/logout` ends it.

A refused request is a 401 whose `error.code` says what to do:
`missing_bearer` (send the token), `invalid_token`, `device_revoked`,
`device_expired` or `reauth_required` (enrol again). Changing your password or
"Sign out everywhere" signs out every phone. Too many attempts get a 429 with
`Retry-After`.

Recording money: `PUT /api/v1/months/{year}/{month}/actuals` with
`{lineItemId, amount, paidOn?, enteredAt?}`, `DELETE …/actuals?lineItemId=…&enteredAt=…`,
and `PUT …/balance` with `{amount, enteredAt?}`. The phone keeps the web's
confirmation step.

The phone can queue these while offline. Each write carries:

- an `Idempotency-Key` header, made when Confirm was pressed, so a write sent
  twice (a retry after a dropped connection) is applied once and the first
  answer is returned again;
- `enteredAt`, when Confirm was pressed. If the entry changed after that (on
  the web or the other phone), the write is refused with 409
  `changed_elsewhere` instead of overwriting the newer value.

## Bank sync

Optional, and off until you turn it on. It uses the
[SimpleFIN](https://www.simplefin.org/) protocol, so any compatible bridge
works; SimpleFIN Bridge is allowed by default.

1. Set `BANK_SYNC_KEY` to a random string of at least 32 characters
   (`openssl rand -base64 48`) and restart. Keep a copy; changing it means
   connecting again.
2. In your bridge account, connect your institutions, then create a setup token
   for a new app.
3. In Budget, Settings → Bank sync → paste the token → Connect.
4. Accounts sort themselves by type on the Accounts page. Correct a wrong type
   or hide an account that isn't yours. Under Settings → Planning, choose which
   bank account the bills balance comes from (picked for you when it's clear).
5. To fill in history older than about 90 days, load a CSV export per account
   on the same page.

Read-only: the protocol cannot move money, and nothing from the feed records a
payment. The access link is stored encrypted; the setup token is used once and
dropped. Every outside request goes through one guarded helper (https only,
allowed hosts only, no private addresses, no redirects, size and time limits).

## Privacy

This repository contains no financial data, account names, institution names,
merchant names or payment links. Bank-feed data lives only in your database. Accounts, categories and line items are created at runtime and
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
