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
5. **The security boundary is network topology, not application code.** The
   container publishes no host port and is reachable only through the
   authenticating reverse proxy. The application has no authentication and does
   not identify users.
6. **No authentication modes.** Deployment styles the project does not use are
   not configuration options.
7. **Financial dates are date-only.** A due date is a calendar day and never
   becomes a timezone-sensitive timestamp.
8. **Business logic does not live in React components or route handlers.** They
   call domain functions. Those functions are where the tests point.
9. **Toolchain versions are pinned and aligned.** Node, Next and the Prisma trio
   move together, deliberately.
10. **Future-proofing is documentation, not speculative abstraction.** Record how
    a boundary would be moved rather than building for a requirement that does
    not exist.

---

## Open

### Nothing open.

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

### No authentication in the application

A proxy-authentication scheme was designed and rejected before it shipped:
`AUTH_MODE`, a username header, and a shared secret verified on every request.

The reasoning that produced it was that the application should not trust a
username header, because a published host port lets anything set one; defending
the header needs a shared secret; the secret needs a configuration contract
between proxy and application.

The flaw was in the premise — the published host port was treated as fixed, when
it is the thing to remove. With the container on the proxy's network, no request
arrives without passing authentication first, and there is nothing for the
application to verify.

The application also has no use for the authenticated identity. It is a
single-household installation; every user who gets through the proxy sees the
same data. Reading a username would answer a question nothing asks.

**What would bring authentication back:** a second household member needing
separate data, a genuine need to attribute a change to a person, or exposing the
application somewhere the proxy does not front. None of those exist today.

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
