# Decisions

A running record of choices that shaped this project, and the reasoning behind
them, so a future change is made deliberately rather than by accident.

---

## Architecture invariants

Rules that hold across the project. Changing one of these is a deliberate
decision to be recorded here, not something to do in passing.

1. **Money is integer cents in the domain layer.** PostgreSQL stores
   `Decimal(12,2)`; the application converts at the data boundary and does all
   arithmetic in whole cents; the interface formats for display. No JavaScript
   floating-point currency math, anywhere. Fields carrying money are named with
   a `Cents` suffix — if it is not named that way, it is not money.
2. **PostgreSQL is the canonical store.** No second source of truth.
3. **Schema changes happen through migrations.** Startup applies migrations and
   reports drift; it never silently reshapes a production schema.
4. **This is month-level budgeting, not transaction accounting.** One
   `ActualEntry` settles one line item for one month, and its existence means
   paid.
5. **Never trust a layer you don't control to protect a route.** The proxy in
   front (Authelia) is the first wall; the app checks every request itself, so
   a gap in the proxy config fails closed. Every server action calls
   `requireUser()`, and the build fails if one doesn't.
6. **No authentication modes.** Sign-in is always on; no environment variable
   turns a security check off.
7. **Financial dates are date-only.** A due date is a calendar day and never
   becomes a timezone-sensitive timestamp.
8. **Business logic does not live in React components or route handlers.** They
   call domain functions. Those functions are where the tests point.
9. **Recording money takes a confirmation.** No control marks a bill paid in
   one click.
10. **Toolchain versions are pinned and aligned.** Node, Next and the Prisma trio
   move together, deliberately.
11. **Future-proofing is documentation, not speculative abstraction.** Record how
    a boundary would be moved rather than building for a requirement that does
    not exist.

---

## Open

### A one-tap paid tick

Parked. A check mark beside each bill would be quicker, but it is easy to hit by
accident, and an undo would only be ticking it again. Payments are recorded by
typing or accepting an amount and confirming. Revisit for a phone app, where a
deliberate swipe could stand in for the confirmation.

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

### Migrations apply; drift is reported, not corrected

The initial migration was hand-written because the tooling to generate it was
not available at the time. Until the first successful deployment the entrypoint
also reconciled any difference with `db push`, as a safety net.

That net has served its purpose — the schema came up correctly — and it is gone
as of 0.2.0. Startup now runs `migrate deploy` only. Drift is still detected and
logged loudly, because knowing is valuable, but the schema is never reshaped
outside the migration history.

### Built-in sign-in (0.13), replacing "no authentication in the application"

Before going public the app needed its own sign-in behind Authelia, so a proxy
misconfiguration does not open it, and the phone needs an API that
authenticates every request. The earlier reasoning is kept below for history.

- **Two equal users, no roles.** At most two accounts; both see and change
  everything. No admin, PIN or auto-lock: there is nobody to keep out of
  settings.
- **One gate.** `src/proxy.ts` runs on every request on the Node runtime and
  asks `lib/auth/gate.ts`, a pure, tested module. Paths cannot gate server
  actions (they are chosen by an id in a header), so every action also calls
  `requireUser()`, and `scripts/check-auth.mjs` fails the build if one doesn't.
- **Stateless signed cookies.** `userId.expiry.credentialVersion` plus an
  HMAC-SHA256 signature; `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, 30
  days. The secret is 32 random bytes minted into the database on first use
  (`SESSION_SECRET` can override it), never a default.
- **credentialVersion** on each user: a password change or "sign out
  everywhere" bumps it, which voids every other cookie at once.
- **Passwords:** scrypt (N=2^15, r=8, p=1) with a per-password salt; one
  `MIN_PASSWORD` (10) for every door. A wrong username costs the same time as a
  wrong password, and the message never says which was wrong.
- **First account needs a code from the container log.** Reaching the page is
  not enough; reading the server's log proves you run it. The page closes for
  good once an account exists.
- **The second account** joins with a one-time code from Settings: 15 minutes,
  one live at a time, only its hash stored, deleted on use.
- **Recovery** without email: `node scripts/reset-password.mjs <username>`
  inside the container sets a temporary password and signs that account out
  everywhere.
- **Rate limits** on sign-in (per IP and per username), first account, join,
  password change and invites, each with a key that is not the IP. The client
  IP comes from `REAL_IP_HEADER`, then `cf-connecting-ip`, then
  `x-forwarded-for`. The limiter's memory is bounded.
- **Return-to paths** go through `safeNext`: same-site paths only.
- **Full page loads** after sign-in, sign-out and account creation, so the
  layout and the gate run again.
- **Who recorded each payment** is kept (`recordedById`).

Earlier reasoning, superseded:

A proxy-authentication scheme was designed and set aside before it shipped:
`AUTH_MODE`, a username header, and a shared secret verified on every request.

The reasoning that produced it was that the application should not trust a
username header, because a published host port lets anything set one; defending
the header needs a shared secret; the secret needs a configuration contract
between proxy and application.

Network placement makes that contract unnecessary: if every route to the
container passes authentication first, there is nothing for the application to
verify. How the container is reached is the operator's call.

The application also has no use for the authenticated identity. It is a
single-household installation; every user who gets through the proxy sees the
same data. Reading a username would answer a question nothing asks.

**What would bring authentication back:** a second household member needing
separate data, a genuine need to attribute a change to a person, or exposing the
application somewhere the proxy does not front. The last two arrived with the
plan to expose the app and build a phone client.

### Money is integer cents

The database stores `Decimal(12,2)`, but the projection engine originally
converted everything to JavaScript `number` and accumulated with `+` and `-`.
Since the entire output of this application is one figure the user acts on,
accumulated float error was unacceptable.

The domain layer now works exclusively in integer cents, converted at the data
boundary. `Decimal(12,2)` tops out at 9,999,999,999.99, which is 999999999999
cents — comfortably inside `Number.MAX_SAFE_INTEGER`, so integer arithmetic is
exact across the full range the column permits.

### PeriodAssignment holds two halves

`THIRD` and `LAST` were remnants of an earlier design that divided a month by its
paydays and could produce three periods. The month is now split at a fixed day,
and the calculation already collapsed those values onto the second half.
Migration `0001` removes them.

### No data in the repository

The repository is public. It contains no account names, institution names,
vendor names, payment links, or figures. Accounts, categories, and line items are
created at runtime. `.gitignore` excludes spreadsheets, dumps, and the import
directory so source workbooks cannot be committed by accident.

### Unpaid bills carry for a limited window

Carrying every unpaid bill back a full year produced phantom debts: months
before the first payment was ever recorded read as a pile of missed bills. Only
months with at least one recorded payment count as tracked, and only the last
`carryMonths` of them (default 1, set under Settings → Planning) are carried.
Older gaps are treated as paid.

### The bills balance carries forward

The balance is recorded per month. A new month uses the latest balance at or
before it and says which month it came from, so the figures never go blank on
the 1st and a stale figure is never mistaken for a fresh one.

### Paid from what's left over

A card whose payment is whatever remains after the bills does not compete with
them for cash. A flagged item leaves the halves, both free-money figures and the
projection's obligations, so those figures become what is available to send it.
It is still tracked in full.

### One place for settings

0.11.0 replaced the setup pages and the separate import page with a single
Settings area: Appearance, Planning, Accounts, Categories, Pay calendar, Import
& export, About. The old addresses redirect, so bookmarks keep working. The line
item editor became a panel over the list for the same reason — fewer pages to
find your way back from.

### Appearance is per browser

Theme (cool or warm) and light or dark are stored in cookies, not the database:
they cost no query on every page, and a phone and a desktop can differ. Every
colour comes from CSS variables, so a theme is a block of variables and nothing
else.

### Fonts are bundled

Fonts come from npm packages and are served by the app. Loading them from a
font CDN would be the one outside request the app makes, and would tell a third
party when the budget is opened.

### Payment links are http(s) only

A stored link is rendered as a clickable href, and URL validation alone
accepted `javascript:` and `data:` — a stored script. Links are checked by one
helper (`safeHttpUrl`) on the way in (form, import) and again on the way out, so
a value saved before the check can never become a live link.

### A strict CSP with a per-request nonce

`src/proxy.ts` mints a nonce for every request and sets the policy; Next stamps
the nonce on each script it renders and `'strict-dynamic'` lets those load the
app's chunks. Styles keep `'unsafe-inline'` because React style attributes
cannot carry a nonce and inline styles cannot run code. There is no
`upgrade-insecure-requests`, because the LAN address is plain HTTP. Framing is
same-origin unless `FRAME_ANCESTORS` names more. `nosniff` and
`Referrer-Policy: same-origin` come from `next.config` so static files get them
too. Every page is rendered per request already, which a nonce requires.

After a change, click through every page and watch the console for
"Refused to …".

### The browser never calls /api/v1

The web interface uses server actions only; `/api/v1` is for the phone and will
take device tokens only (0.14). The importer was the one exception and moved to
server actions in 0.12. Files marked `"use server"` export only actions —
every export there is callable from outside — and helpers live in plain modules.

### Size caps on every body

API routes read at most 256 KB, import at most 5 MB, checked against the
declared length and again against the bytes read; over the cap is a 413. Server
actions are capped at 6 MB, room for the import document.

### Framework endpoints we don't use are off

Nothing uses `next/image`, so its optimizer is disabled (`images.unoptimized`).
It has had advisories, and it would answer without sign-in.

### Upgrades follow one routine

1. Check what's flagged: `npm audit --omit=dev` (what ships), then `npm audit`.
2. Read the official upgrade guide for the target version; grep for every
   breaking change before editing.
3. Security patches first and alone; one major upgrade per release.
4. Pin exact versions (`--save-exact`); Prisma's client, adapter and CLI
   always identical, including the CLI the Dockerfile installs.
5. `npm run preflight`, `npm test`.
6. Production build, start the built server, click through every page in a
   real browser with the console open. A green build alone proves nothing.
7. Audit again; note anything left and why it can wait.
8. Record it: a changelog line, and the table below.

`npm audit fix` without `--force` is fine for indirect packages; `--force` is how
majors sneak in, so those are done by hand. The lockfile is regenerated with
`rm -rf node_modules package-lock.json && npm install` and checked for the
other platforms' optional packages before it ships.

### Current versions

| Part | Version | Note |
| --- | --- | --- |
| Next.js | 16.4.6 | |
| React / React DOM | 19.3.1 | |
| Prisma client / adapter-pg / CLI | 7.10.1 | All three identical, Dockerfile CLI included |
| pg | 8.23.1 | Pool: max 10, connect timeout 5 s, idle 30 s |
| zod | 4.6.7 | |
| TypeScript | 5.9.3 | |
| Tailwind | 4.3.5 | |
| Vitest / Vite | 5.1.0 / 8.3.8 | Dev only |
| qrcode | 1.5.4 | Add-a-phone QR, rendered on the server |
| Node | 24 (`node:24-alpine`) | |

If a backup leaks: delete the `auth.sessionSecret` row from `Setting` and
restart (everyone is signed out), then change both passwords.

### The phone API takes device tokens only (0.14)

`/api/v1` is the one path the outer proxy lets through, so it can rely on
nothing the proxy does. Every route calls `requireDevice()`; the browser's
session cookie is never read there; `scripts/check-auth.mjs` fails the build
if a route forgets. Only `meta`, `auth/login` and `auth/enroll` are public.

- **Tokens:** `bud_` + 32 random bytes, returned once; only the SHA-256 is
  stored. A year's life, refreshable (the old token dies on refresh),
  revocable from Settings or by the phone itself.
- **Adding a phone takes two factors:** the password (step 1 returns a
  five-minute signed proof) and a one-time code made on the web by the same
  person (15 minutes, one live per person, hash stored, deleted on use). A
  stolen password alone can't add a phone; a glimpsed code alone is useless.
- **The QR** carries `budget://enroll?server=…&code=…`. The server address
  comes from the page you are on, so it is never built into the app.
- **credentialVersion** is copied onto each device. Changing the password or
  signing out everywhere revokes every phone, and the version check refuses
  any that slipped through.
- **Stable 401 codes** (`missing_bearer`, `invalid_token`, `device_revoked`,
  `device_expired`, `reauth_required`) so the phone reacts precisely, and it
  confirms with `/auth/me` before discarding its enrolment.
- **Rate limits:** phone sign-in shares the web's limits, so two doors don't
  double the guesses; enrolment is limited per IP and per person; refresh per
  device.
- **No ownership checks between the two people.** The budget is shared by
  design; only device revocation is scoped to the device's owner.
- `lastSeenAt` is written at most every 15 minutes.

### The phone queues writes while offline (0.15)

The phone keeps a queue of payments and balance changes made without a
connection and sends them when it is back. Two rules keep that safe:

- **Applied once.** Each write carries an `Idempotency-Key` made when Confirm
  was pressed. The server keeps the first answer per device and key for 30
  days and returns it to any repeat, so a retry after a dropped connection is
  never applied twice. The same key on a different request is refused.
  Refusals (409, 422) are kept like successes; a 5xx or 401 is not, so the
  write can be tried again.
- **Never overwrites newer.** Each write carries `enteredAt`, when Confirm was
  pressed. If the stored entry changed after that (plus two minutes for clock
  drift), the write is refused with 409 `changed_elsewhere` and the phone shows
  it for the person to check. A timestamp more than a day ahead is ignored.

Known gap, accepted: if an entry was *removed* on the web after the phone
queued a payment for it, the queued payment recreates it — there is nothing
left to compare against. The phone lists what it synced so it can be spotted.

## One look with the phone (0.16)

The web takes the phone app's design: Figtree (bundled, no font requests),
Phosphor icons inlined as paths (no icon dependency), the phone's cool grays,
and its six accents, each with a light and a dark tone. The accent is the
`data-theme` attribute; the hero card is the accent itself, with
`--on-accent` for text on it (white in light mode, a dark tint in dark mode,
since dark-mode accents are light). Old Cool/Warm cookies fall back to Cobalt.

## Bank sync (0.17)

Through the SimpleFIN protocol, so any compatible bridge works and none is
built in. Read-only by design: the protocol has no way to move money.

- **Off until asked for.** Nothing runs, and no outside request is made, until
  `BANK_SYNC_KEY` is set and a setup token is pasted in.
- **One guarded door.** `src/server/bank/simplefin-client.ts` is the only code
  that reaches outside: https on 443 only, hosts on an allow-list
  (`SIMPLEFIN_EXTRA_HOSTS` adds more), no private or loopback addresses, no
  redirects, a 60-second timeout and a 25 MB cap. Credentials go in the
  Authorization header, never in a URL or a log.
- **The access link is encrypted** with AES-256-GCM under a key derived from
  `BANK_SYNC_KEY`, so a database backup alone can't read anyone's accounts.
  The setup token is used once and never stored.
- **Generic in the repo, personal in the database.** Merchant cleanup rules
  describe description formats (processor prefixes, store numbers, order ids),
  never particular merchants. Institution names, account names and anything
  else from the feed live only in the database. Tests use invented names.
- **Every account is the person's call.** Spending, Balance only or Hidden;
  nothing is used until chosen. Transfers pair only between included accounts,
  so a hidden account's moves stay visible on the included side.
- **Transfers:** opposite amounts to the cent, different accounts, within five
  days, closest first, each row once. No keyword guessing; wording varies too
  much to trust. Verification cents (under a dollar, labeled as such) are
  ignored.
- **Duplicates** between a CSV and the feed match on amount within three days,
  one to one, because the two copies are dated and worded differently.
- **Quota.** Bridges allow a couple of dozen requests a day: one daily sync,
  retries three hours apart, and at most six manual syncs a day. Each sync
  re-reads two weeks so pending charges that post at a new amount are fixed.
- **Suggestions only, later.** Nothing from the feed records a payment. A
  "looks paid" hint will come, and the person still confirms it.
