# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org):
the minor number moves when features land, the patch number for fixes.

## [0.113.0]

### Added
- **Confirm a guess:** "guessed · Confirm" next to a guessed category. Keep it for this one, or for
  everything from the merchant so it stops being guessed.
- **New category from the item picker:** "New category…" on an Amazon item, with the budget it
  goes in.
- **Amazon refunds take the returned item's category** (an item of the same amount, within 2%, on
  an Amazon charge in the 120 days before), shown as "returned item".

### Changed
- Amazon charges no longer show a merchant guess or count under Guessed: their order decides. A
  pending one says "Splits once it posts".
- Amazon items left without a category get another look after each bank sync, and the item names
  know more: period products (Personal care), aquarium brands, Xbox and PC parts, snacks, cake
  toppers and cards.

## [0.112.0]

### Changed
- **Amazon matching takes card digits as a hint.** The digits a bank shows for an account often
  aren't the card number Amazon shows, which left matching charges unsplit. A charge on the card
  with the same digits is still preferred; one showing other digits is taken when it's the only
  charge with that amount and date.
- `GET /api/v1/amazon/unsplit` leaves out Whole Foods in-store and Woot charges, which have no
  Amazon order and kept every extension sync reading back to their dates.

## [0.111.0]

### Changed
- **Amazon Orders (CSV) import works like the extension's sync:** one split per item, a category
  you fixed for an item wins (matched by Amazon's product id, which the file has, or the name),
  and an item that can't be placed gets no category and shows under Needs a category instead of
  taking the charge's own. Charges already split (by the extension) are left alone.

## [0.110.0]

### Added
- `GET /api/v1/amazon/unsplit`: Amazon card charges from the last 120 days that aren't split yet
  (date, amount, card's last 4; digital and membership charges left out). The Amazon extension
  0.4.0 uses it to read only the orders it still needs and to say which charges it found.

## [0.109.1]

### Added
- Transactions: an Amazon charge the extension hasn't matched to an order shows "No order match",
  so it's clear its category wasn't set from the order. Prime, Kindle, Audible and other digital
  charges don't, since they never have an order.

## [0.109.0]

### Added
- **Cards used by others** (Settings › Data Imports & Exports): list who has their own card on
  which of your accounts (name and last 4). Each person gets a "for others" category, kept out of
  your spending and income. Each month, load the card's transactions file (CSV) from the bank's
  site: Ledger matches each row to a charge it already has by amount and date, and moves the
  listed cards' charges to their person's category. Their repayments go in the same category, so
  Insights › Money shows what each still owes. The file is read and dropped.
- When the month's card file is due (a statement closed since the last one): an Action Item on
  Review, a Today item on the phone and a "Card file due" phone notification (`cardFile`).

## [0.108.0]

### Changed
- **Amazon extension sync splits per item:** each item gets its own split, placed by Amazon's
  category (sent by the extension) before its name. A category you fixed for an item wins; an item
  that can't be placed gets no category and shows under Needs a category, instead of taking the
  charge's guessed one. Requires the extension 0.2.0 for categories.
- `POST /api/v1/amazon/orders` takes optional `productId` and `category` per item (bad values are
  dropped, not refused). It also answers `noMatch` and `noChargeList` counts, and `done`: the
  positions of finished orders in the batch, so the extension stops rereading them.

## [0.107.0]

**Migration 0028** (applied on start): `TransactionSplit.itemKey`.

### Added
- **Fix an Amazon item's category once.** Open a split charge in Transactions and pick a category
  for any item. Ledger remembers it for that item (by a keyed hash, never the name) and changes
  the same item in every other split, now and in later syncs.
- Charges with an item that has no category show under Needs a category.
- For the Amazon extension (`src/server/amazon-items.ts`, `src/lib/amazon-orders.ts`):
  `itemKeys`, `itemRules`, `ruleFor`, `kindFromCategory` (Amazon's category path, e.g.
  "Grocery & Gourmet Food › Produce", as a kind) and `splitByItem` (one part per item).

### Changed
- Item names now know common food words (produce, snacks, pantry and so on), so groceries without
  Amazon's department aren't left in the charge's own category.

## [0.106.5]

### Changed
- Transactions: a charge split from an Amazon order shows its category ("Groceries · Amazon"), or
  "3 categories · Amazon" when it's split across several; click it to see each item in a row under
  the charge. Opening it no longer moves the columns.
- 0% cards: the payment that clears the card by the offer's end is back, beside the planned
  payment: on the phone's Insights and Cards, and on the Tracker's card summary
  ("$1,867/mo clears it by Feb 11, 2028").

## [0.106.4]

### Added
- Transactions: a charge split by item (from the Amazon extension or Order History.csv) shows
  "Split" with its categories instead of the charge's own category; click it to see each part,
  its items and amount. Split charges no longer count under Guessed.

### Changed
- The phone's 0% payoff card (the payment needed to clear the card by the offer's end) is off;
  the 0% card's payment comes from Bills & Income.
- Tracker card summary: "Payment by …" and "0% · N payments left" on a 0% card.

## [0.106.3]

### Fixed
- Card amounts on the phone's Cards tab, card reminders and the Tracker's card summary are what's
  planned: a payment set on Payments first; on a 0% card, the month's debt payment (not the pace
  that clears it by the offer's end); otherwise what's left on the statement.
- The phone's "card payment due" alert no longer fires for a card already paid this cycle.

## [0.106.2]

### Changed
- The "No Amazon sync in 3 days" alert now says "Open Chrome to let it sync", since the extension
  syncs on its own.

## [0.106.1]

### Fixed
- Payments: the statement building now counts pending charges, so pending charges no longer show
  as a negative "Other" row in Planned vs actual.

## [0.106.0]

### Added
- **Amazon extension sync:** `POST /api/v1/amazon/orders` takes orders read by the Amazon browser
  extension and splits each matching Amazon card charge by item, the same way as Order History.csv.
  Amazon's own charge list is matched first (amount within a cent, date within five days, the
  card's last 4 when its name shows them), then item totals. Charges already split are left alone,
  so sending an order again changes nothing. Only item names (encrypted) and the split amounts are
  kept; the answer is counts only.
- `GET /api/v1/amazon/status` (last sync, charges split this month, orders waiting, and where the
  next sync starts) and `POST /api/v1/amazon/runs` (each sync's outcome, as codes).

## [0.105.0]

**Migration 0027** (applied on start): adds `Device.scope` and the `AmazonSync` table. The Docker
image is now `ghcr.io/thorin29/ledger` (the repo was renamed).

### Added
- **Scoped device tokens:** `POST /api/v1/auth/enroll` takes an optional `scope`, `full` (the
  default) or `amazon`. An `amazon` token only works on `/api/v1/amazon/*`, `auth/refresh` and
  `auth/logout`; anywhere else it gets 403 `wrong_scope`. Settings › Sign-in & people shows each
  device's access, and `check-auth` fails the build if the scope check goes missing.
- **Amazon extension status:** the extension's last sync (one row: when it ran, when it last
  worked, its status, which part failed as a short code, its version, charges split, orders
  waiting; no free text and nothing from Amazon). Once an Amazon-scoped device exists, a sync that
  failed or none in three days shows on Review and as a phone alert (`amazonSync`, off until turned
  on), and clears after the next good sync. Details are in Settings › Data Imports & Exports ›
  Amazon Extension.

### Changed
- Changes file: a line added with `addBill` starts this month unless `from` says otherwise, so
  earlier months aren't counted as owed.
- Default budget groups and insight suggestions match generic category words instead of a
  specific list of names.

## [0.104.2]

### Changed
- Transactions: the button that applies a category or a transfer to every transaction from a
  merchant reads "All from this merchant" (the merchant's name is in its tooltip), so it no longer
  runs off the edge.

## [0.104.1]

### Changed
- Payments: the Month / cycle switch follows the selected payment. A card planned by cycle offers
  its own cycle; other payments show the month. The switch now changes the history chart too
  (Months or Cycles), not just the period table.

## [0.104.0]

No migration. The phone app is unchanged.

### Added
- **Transfers for a whole merchant:** picking "Transfer (not spending)" asks "This one" or "All
  from …". All marks every transaction from that merchant as a transfer, now and after each sync
  (one you set to a category by hand stays). Turning a transfer back off forgets the merchant.
  Payment apps are always one at a time.
- **Payments:** drag a payment across the top to put them in your own order; it's kept.

### Changed
- **Bills that vary** (marked "Varies month to month"): a month with no amount set uses what the
  same month cost last year, rounded up to a dollar, so the target follows the seasons. They no
  longer show up under Budget changes.
- **Category guesses:** no store-specific category any more.

## [0.103.3]

Includes the 0.102.1 changes again (Settings "Data Imports & Exports", the By card link removed,
empty statement sections say so), in case that release was skipped.

### Added
- **Cycles** chart on Payments (it replaces the statements and average-checking charts): each of
  the last six periods (the cycle card's statements, or months) with what came in beside what went
  out (bills, the 0% payment, Essentials, Extras, Unplanned), the plan, and the net under each.
- **Changes file:** `addBill` adds a bill, paycheck or card payment (some months only with
  `months`, starting later with `from`, paying a card with `paysCard`).

### Changed
- Bills & Income: a card payment set from its statement shows "Statement" and the amount due next
  month instead of a fixed usual amount.

## [0.103.2]

### Changed
- Payments, the statement building now: the amount is the statement so far (what's on the card,
  rising as charges come in), with the plan beside it. The month's income shows the statement so
  far and what the plan still expects; checking until payday and Set payment use the plan, so the
  Tracker's line stays a realistic goal.
- Payments: checking at the end of the period follows the payment as picked (amount and day).

## [0.103.1]

### Changed
- Payments: a card has two statements to pick from, the last one and the one building now. Once
  the last one is paid, the page opens on the one building now: its plan as the amount, what's on
  the card so far, and the month it's due.
- Payments: cards planned by cycle come first, then the other cards by statement, then the 0% card.
  Bills are no longer listed (they're paid on their own).
- Budget changes: a budget isn't called over until three full months after its amount was set.
  Skip on one hides it for three months, or until its amount changes.

## [0.103.0]

No migration.

### Added
- **Payments** (side menu): every payment coming up (card statements, the 0% payment, bills that
  vary), and what each does before it's made.
  - **Checking balance** from the bank, or a figure typed in for this page only (Reset puts the
    bank's back).
  - **What to pay:** the full statement, an adjusted statement (when the real one doesn't match),
    or another amount, and the day it comes out of checking. **Set payment** saves it: the
    Tracker's card-payment line uses it, and a 0% payment or bill gets that month's amount.
  - **Planned vs actual:** the closed statement against its plan by section, with what the budgets
    don't explain (Other), a balance carried from the statement before, and what was paid during
    the statement, so the rows add up to the statement.
  - **Payment impacts:** the month's income less its bills, the 0% payment, the other cards and
    this payment; and checking until the payday after the payment, with its lowest day and a
    warning when a payment would leave checking short.
  - **The period:** this month, or a card's statement cycle, set out like a month (income, bills,
    the 0% payment, Essentials, Extras, Unplanned, what's left) with checking at the start and
    projected at the end.
  - **Budget changes:** the one list of suggested changes (bill amounts that moved, budgets with no
    amount, budgets over three months running). Nothing changes until it's accepted.
  - **History:** the last six statements against their plans, and average checking per cycle.
- **Plan by statement cycle:** an option on a card in Settings › Accounts.

### Changed
- Review no longer shows bill amounts that changed: they're under Budget changes on Payments.

## [0.102.1]

### Changed
- Settings: "Import & Export" is now "Data Imports & Exports".
- Insights › Budget › By card: the "See this card by statement" link is gone (the statement is its own tab).
- A statement section with no charges says so when opened.

## [0.102.0]

No migration. The phone app is unchanged (it picks up the new card-payment amounts on its own).

### Changed
- **Card statements are planned by month portions.** A statement holds the end of one month and
  the start of the next, and its budget is made of those parts: the end of a month that has
  started gets what that month's budgets still have left (spending before it on every account
  taken out, at the card's share, never below zero); the start of a month gets the month's budgets
  by days. Bills landing on the card inside the statement are added. Budgets are the same every
  month, so money carried over never adds to a statement. The statement page shows each part.
- **Money for the statement:** the month it's due, as the Tracker sees it: pay, less bills paid
  from checking, the 0% payment and the other cards' statements due that month. What's left is the
  most the statement can be; the page shows what's to spare, or how short it is. Extra pay that
  goes to the 0% card isn't counted, and neither is money already in checking.
- **Card payments on the Tracker come from the statement:** a closed statement's amount, or the
  plan for one still open or to come. They aren't set by hand any more.
- **One amount for each bill.** The Tracker's budget box asks "This month only" or "From now on";
  from now on changes the usual amount from that month and removes one-month amounts after it.
  Bills & Income shows this month's amount under the usual one when they differ.
- **Amount suggestions:** a bill whose last three payments have all moved the same way is flagged
  ("has gone up"). A bill marked "Varies month to month" (water, energy) is a target: it's
  flagged when the last six payments' middle amount is off by more than 10%.

### Added
- **Changes file:** `setAmount` (the usual amount from a month on), `setTarget`, and `setBill`
  takes `scheduleKind` and `months`.

## [0.101.0]

No migration. For phone app 0.21.0.

### Added
- **Phone views** under `/api/v1/phone/`: `today` (available to spend on the main card's
  statement, checking, the month's budget left, what needs you, the next bills), `budget` (the
  month, each card's statement or by card, as on the web's Budget tab), `overview` (income vs
  expenses, the outlook, last month, debt) and `alerts` (everything that could notify, each with a
  stable key; the phone keeps the kinds it's set to).
- **Transactions for the phone:** `GET /api/v1/transactions` (filters: needs a category, pending,
  money in; search) and `PUT /api/v1/transactions/:id` to set a category (one or every charge from
  the merchant) or mark a transfer.

## [0.100.1]

No migration. The phone app is unchanged.

### Changed
- **Switching tabs:** the Insights tabs and the sidebar pages are fetched ahead in the background,
  so a click shows the page at once instead of waiting on the server. Pages just visited are reused
  for up to 30 seconds (a minute for ones fetched ahead); anything changed in the app clears them
  right away.

## [0.100.0]

No migration. The phone app is unchanged.

### Changed
- **The app is called Ledger:** the sidebar, sign-in page, browser tab and home-screen name. The
  repo, the Docker image and the phone app keep their names for now.
- **Bills paid at the bank but not recorded yet:** a bill whose payment is already in the bank feed
  (still pending, or posted and waiting to be matched) shows "Pending" instead of due or overdue,
  and that charge isn't counted as "Needs a category" too. It's found by the merchants that paid
  the bill before and an amount within 10%.
- **Overdue** only two days past the due day ("Due yesterday", "Due 2 days ago" before that): the
  bank feed is often a day or two behind.
- **Trends:** the "Partial before…" note is gone.

### Fixed
- A pending loan payment from checking showed as "Needs a category": past payments of the bill had
  been paired as transfers, so they weren't seen when looking for what pays it.

## [0.99.2]

No migration. The phone app is unchanged.

### Changed
- **Much faster pages:** the figures behind each page (the month's plan, the month view, cash
  timing, outlook, debt, net worth, insights, review) are kept until something in the database
  changes (a bank sync, an edit) or the day changes, so going back to a page or switching tabs
  doesn't work them out again. Two writes that happened on every page view (placing new categories
  in budgets, saving the month's net worth) now happen only when something changed.
- **Review, Needs a Category:** only checking and card charges (not investment or retirement
  accounts); pending charges show, marked "(pending)".

### Fixed
- **A bill payment not matched yet** (pending, or a few dollars off the planned amount) no longer
  shows as "Needs a category" on top of the bill still counted as due. A charge with no category from
  a merchant that has paid a bill before, within 10% of what it paid, counts as that bill until it's
  matched.

## [0.99.1]

No migration. The phone app is unchanged.

### Changed
- **Faster pages:** a page shows its outline the moment it's clicked (the tabs stay put) and fills
  in when its figures are ready. The month's plan and month view are worked out once per page
  instead of once for each part that needs them, and the Overview works out its parts side by side.
- **Review:** charges from the last 60 days that still need a category are listed under Action
  Items, with the category picker (including Transfer) right there.
- **Unplanned reserve:** the whole reserve sits on the card unplanned spending usually lands on,
  instead of being split into small shares across cards.

## [0.99.0]

No migration. The phone app is unchanged.

### Changed
- **Overview:** the five small tiles sit in one short row (checking, budget, the main card's
  statement, debt, last month), each opening its tab when clicked, so Income vs Expenses and
  Outlook move up. Stray links are gone.
- **Income vs Expenses ring:** solid red only for money actually spent or paid past income. A pale
  red arc shows how far past income the month may go once bills still due and the budgets left are
  used. Bills still due never turn it red.
- **Outlook:** labels stay inside the chart. No page scrolls sideways any more.
- **Loans:** one short line under each loan (the 0% offer, "Balance from the bank" or "Balance as
  of …"), no links, payments and payoff kept on one line; the rate column hides on a phone.
- **Debt & Net Worth:** no "estimate" link next to the home.
- **Budget, By card and statement tabs:** no note under each card and no "% usually here" after
  budgets.
- **Extra income** follows the pay calendar: the 3rd check is extra for every-two-weeks pay, the 5th
  for weekly pay; twice-a-month and monthly pay never have an extra check. Without a 0% card the
  setting is hidden and extra pay stays in the month's money.

### Fixed
- **Outlook window:** paychecks with the same name tag ("· 1st paycheck") weren't seen as the same
  paycheck, so the Outlook ran to the end of the month with no payday split.
- **Pay a few days late** (the bank feed catching up) still counts as coming in for five days.
- **Transfers:** pick "Transfer (not spending)" in a transaction's category list for money moving to
  another of your accounts (a loan the feed doesn't show). Hand-marked transfers, and those from a
  changes file, now survive the next sync.

## [0.98.1]

No migration. The phone app is unchanged.

### Changed
- **Budget tab views:** Month, By card, and a statement tab per card, all with the same layout: a
  period bar (day X of Y), two cards on top, the same key and the same columns, so switching tabs
  doesn't move the page. The card breakdown moved from the Month view to its own By card tab.
- **Statement tab:** the two cards are the budget remaining on the card (today and by the
  statement date) and the statement (charged so far, bills pending, projected). The per-day amount
  sits under Remaining, so the table fits without scrolling.
- **Bills** show their budget and what was charged: "—" while a bill is as budgeted, the difference
  once a charge comes in over or under. "To come" is now "pending"; "Projected spend" is
  "Projected".
- **Extra income to the 0% card** keeps back what the month needs to cover spending already past a
  normal month's money, and adds only the rest to the payment.
- The cushion link goes to Settings › Accounts.

## [0.98.0]

No migration. The phone app is unchanged.

### Added
- **Budget › By card:** under Bills & debt, the month's money split by where it was paid: each
  credit card, the 0% card's payment, and checking (bills paid from it and debit purchases). Each
  card opens to its bills, Essentials, Extras and Unplanned, and each budget in them. A card's
  budget is the bills that land on it plus its usual share of each budget (from the last twelve
  months). It only splits money already counted, so the totals don't change. Each card shows its
  typical month and its card-payment line.
- **Budget › card statement view** (a tab per card with a typical month over $100): the card from
  its last statement date to the next. Charged so far, bills still to land on it (and which have),
  room left in its budgets with a per-day amount, and the statement projected at the same pace the
  month uses. Budgets are the card's share of the month's, starting over at each statement.
- **Overview:** a tile for the main card's statement: charged, bills to come, room per day, projected.
- **Checks** under the Budget tab: the card rows add up to the page, each card's balance matches
  the bank (statement − paid + new charges), and charges waiting for a category or not on the bill
  list.
- **Settings › Budgets:** an unplanned reserve (set aside first; unplanned spending past it comes
  out of everyone's room), and "Bonuses and 3rd paychecks go to the 0% card": budgets then run on a
  normal month and any extra income that month is added to the 0% payment.

### Changed
- The "change in Settings" link sits at the foot of each Insights page. "Charges that may be
  bills" opens to list them.

## [0.97.2]

No migration. No app changes: test data replaced with invented names and amounts.

## [0.97.1]

No migration. The phone app is unchanged.

### Changed
- **Changes File:** a bill can be named instead of given by id, when only one bill has that name
  (for a bill an import just created).

## [0.97.0]

No migration. The phone app is unchanged. On first start, payments on record for every year are
paired with their bank charges (once).

### Added
- **Import & Export › Changes File:** a JSON list of fixes (rename, merge or delete categories and
  budgets, set a bill's category, kind, accounts or months, merge bills, tie a loan account or a pay
  schedule, recategorize or unpair transactions, merchant rules, and picks left to you). Every step
  is shown and checked before anything changes.
- **0% card:** the automatic payment is what clears the balance before the offer ends, and the
  month shows "Enough" or "Short by $X" after bills and usual spending.
- **Same-name items** show one name with a tag: "Pay · 2nd paycheck", "Crypto · 23rd".
- **Trends** marks months before an account's bank history starts as partial. Trends and the Year
  plan each say what they count (charged vs paid).

### Changed
- **Usual spending** is the typical month (the middle of the last 12), or the same month when it ran
  higher in each of the past two years. It was a 12-month average, so one big month inflated it.
  Trends, category pages and the month's pace compare with the middle of the months before, not
  their average.
- Recorded payments pair with bank charges across all history (it stopped at about two years), and
  pairing settles monthly chains by month, prefers a charge that names the bill, and needs the
  bill's name or merchant for round small amounts like $35.00.

### Fixed
- Loan and mortgage accounts from the bank count in Debt and Net Worth even before a bill is tied
  to them (unless a bill with a typed balance already looks like the same loan).
- A month that's over counts the 0% payment actually made, not one worked out from today's balance.
- A payment recorded in a month outside its bill's schedule (or on an inactive bill) shows on the
  Tracker, as it already did in the Year plan.

## [0.96.1]

No migration. The phone app is unchanged.

### Fixed
- **Security:** the audit file included the sign-in signing key (a setting, which the field-name
  filter didn't catch). Secret settings are now never exported.
- **User Accounts › Sessions › Sign out everywhere** now also replaces the sign-in key, so a copy of
  the old one can't be used. Both users sign in again.

## [0.96.0]

No migration. The phone app is unchanged.

### Added
- **Import & Export › Audit file (JSON):** everything stored (read through the app, so encrypted
  fields come out readable) and the figures each page shows for every month with data (Tracker,
  plan, insights), each year's plan, and today's debt, net worth, cash, review, cards, payoffs and
  homes. Each transaction carries its merchant key so merchant rules can be matched. Passwords,
  phone sign-ins, the bank link and API keys are left out. A part that fails is recorded in the
  file instead of stopping it.

## [0.95.1]

No migration. The phone app is unchanged.

### Changed
- Tracker: the line under the month reads "Second half starts Nov 21, after the second payday" (which
  of the month's paydays splits it), not "after the 20th payday".

## [0.95.0]

No migration. The phone app is unchanged.

### Added
- **Tracker periods: one per paycheck.** Pay Settings › Tracker Periods › "One period per paycheck"
  groups the month's bills by the pay period their due day falls in (payday to the day before the
  next), weekly, every two weeks, twice a month or monthly, following whichever schedule is in
  effect, so a new employer's schedule takes over on its own once the old one is ended. Days before
  the month's first payday show as the previous paycheck "(Cont.)". The Tracker shows each period's
  pay, paid and pending, and a card for the current paycheck. The halves stay behind the scenes for
  the cash figures.

### Changed
- Tracker: the line under the month says what the split means ("Second half starts Nov 21, after the
  20th payday", or "2 paychecks this month"), and "still owed" / "left" now read "pending".
- The Settings menu pins where it starts, so it no longer slides up before locking.

## [0.94.0]

No migration. The phone app is unchanged.

### Added
- **Import a year from CSV:** the Year Plan download (or the new template) filled in with Excel or
  Google Sheets and saved as CSV. The year comes from the file name or the box beside it; everything
  is reviewed before it's saved, as with JSON.
- **Pay Settings › Employers & Pay Schedules:** link paychecks to a schedule right there, and end a
  schedule (an employer you left) on a date: past paydays stay, and ended ones move to "Ended". Reopen
  undoes it.
- **Tracker Periods:** whole month (no split), two halves at the payday nearest the 15th (choose the
  schedule when there are several), or two halves on a fixed day. Whole month shows one "This Month"
  list on the Tracker.

### Changed
- The cushion moved to Accounts (with the checking account) and the 0% debt payment to Accounts
  (with the cards). The bills account, look-ahead and carry moved to Bills & Income › Options. Pay
  Settings is only about pay now.
- The Settings heading stays pinned with the menu; menu groups are boxed with a line between pages;
  "App" is now "System". New subtitles for Pay Settings, Accounts and Import & Export; User Accounts
  wording.
- Tracker: the "Record payment" button is gone (record on any row; ⌘K / Ctrl+K still opens quick entry).

## [0.93.0]

No migration. The phone app is unchanged.

### Changed
- **Settings menu stays put** while the page beside it scrolls. Renamed: Bills & Income, Budgets,
  Pay Settings, Property Management, Bridge Connectivity (optional), Import & Export, User Accounts
  (Signed-In Devices), with shorter or no subtitles.
- **Pay Settings** joins the pay calendar and planning: paychecks (with which income items use each
  schedule), the month split, look-ahead, carry, cushion and 0% payment on one page. "Divide the month
  at" can pick which pay schedule's payday splits the month (for two employers on different
  schedules); otherwise the one most paychecks use.
- **Property Management** holds any number of homes ("+ Add home"), each with its own address,
  estimates, history and RentCast lookup (the key and the 5-a-month limit are shared). Each home is
  its own line in net worth; the first one counts toward home equity. Extra homes can be renamed or
  removed.
- **Danger Zone** (Bridge Connectivity): deleting all bank data opens a red dialog listing what goes,
  with a red button to confirm.
- Headings and tabs use Title Case; explanatory text across Settings and the bill form is cut back.

## [0.92.0]

No migration. The phone app is unchanged. Every setting now has one home in Settings; Insights only
shows figures, with a "change in Settings" link on the tabs whose figures are set there.

### Changed
- **Settings menu in three groups:** Plan (Bills & income, Budgets & categories, Pay calendar,
  Planning), Money (Accounts, Home & net worth, Bank connection), App (Import & export, Sign-in &
  people, Appearance, About). Settings opens on Bills & income, which now sits inside it.
- **Insights › Setup is gone:** budgets and categories moved to Settings › Budgets & categories, the
  home value to Settings › Home & net worth, the 0% debt payment and the cushion to Planning.
- **Categories in one place:** Budgets & categories → All categories adds, renames, marks "for
  others" (and back) and removes categories. Settings › Categories is gone.
- **One checking cushion:** Planning's "Keep a floor of" and Insights' "Checking cushion" were two
  numbers for the same thing; now one, in Planning, used by Cash, Budget and the projection.
- **Accounts moved into Settings** (out of the main menu): the editor stays open beside the list and
  shows the account clicked; name, type, card days, 0% end, color and "Holds the bills money" save
  together with Save (Undo changes resets; leaving with unsaved changes asks). Accounts typed by hand
  are the "By hand" group. Settings › Accounts for bills is gone, and so is Planning's "Bills balance
  from your bank" (it's "Holds the bills money" on the account now).
- **Loans:** the interest rate and the escrow part of the payment are set in the bill's form under
  "Pays off a balance", with its balance. The Debt tab shows them and links there.
- **Exports** (transactions, accounts, each year's plan) are only in Import & export.
- Old addresses (/accounts, /insights/settings, /insights/envelopes, /setup/*, /import,
  /settings/categories) open their new pages.

## [0.91.0]

No migration. The phone app is unchanged.

### Added
- **Bills & income → what's recorded on a line:** each bill's form shows its payments (count,
  total, months) and the months with their own amount, or that it has nothing and deleting it
  loses nothing.
- **Merge a duplicate:** "Move into…" another line and "Merge and delete this line" moves the
  payments, months' amounts and bank matching to the other line, then deletes this one. Lines
  with the same name are listed first. A month both lines have keeps the other line's entry.

## [0.90.1]

No migration. The phone app is unchanged.

### Added
- **Setup → All categories:** every category in one list, with its budget, "money for others"
  or "turned off", and a search box. Click a name to rename it. A money-for-others category
  (like a league you collected for) has "Count as mine" to make it ordinary spending again.
  Before, those categories didn't appear anywhere in Setup.
- Home value: RentCast's row says when the next automatic lookup is.

### Fixed
- Home value history now includes every estimate in the list, also ones saved before the history
  was kept. Removing one from the history also takes it out of the list.
- The Home value item in Setup's list shows the value net worth uses (with RentCast), not only the
  typed-in average; the line by Save is labeled "Typed-in average".

## [0.90.0]

No migration. The phone app is unchanged.

### Added
- **Review → Recorded automatically:** each payment has **Change** (not a bill payment: count the
  charge as spending in a category you pick) and **Unrecord** (the charge goes back to ordinary
  spending in its usual category). Either way it stays on its card and isn't matched to that bill
  again. Before, Undo left the charge in the bill's category.
- **Rename categories** in Setup: click a category's name (in a budget, or under Categories
  without a budget). Transactions, bills, budgets and rules follow.

### Changed
- **A name given to an account in Accounts applies everywhere:** Transactions (with the card's
  last four digits), the account filter, Bills & income's Paid from and Charged to, the month
  view, Review and CSV import history, including accounts that came from the spreadsheet import.

### Fixed
- RentCast: a failed lookup stamped by an older version blocked new ones as "already looked up
  today" while showing no value. Only a lookup that found a value holds off the next one now, and
  the last try (time and RentCast's error) shows under "Or look it up automatically".

## [0.89.0]

No migration. The phone app is unchanged.

### Added
- **Bill amounts that change over time:** changing a bill's usual amount asks which month it
  starts ("Starting", the next unpaid month by default); earlier months keep the old amount.
  "Every month, past too" changes them all.
- **Payment history** in each bill's form: its payments in stretches of about the same amount
  (three or more in a row within $2 or 2%), e.g. a mortgage by escrow year or while extra
  principal was paid. "Set past budgets to what was paid" makes each stretch its months' budget.
- **Review → Amounts that changed:** a bill whose recent payments say the usual amount is out of
  date (a steady new amount, or for a bill that varies, the last year's average off by 10%+).
  "Use $X from <month>" updates it, optionally setting earlier stretches as their months'
  budgets and, for a loan with escrow, moving the escrow by the payment's last change.
- **Home value, past values:** add a value from an earlier year (month optional), e.g. last
  year's county appraisal. Each source counts with its newest value while it's current. Values in
  the history can be removed.

### Changed
- RentCast's value shows in the estimates list. "Look up again" and "Save and look up" now say
  what happened: the value found, RentCast's error, or why no lookup was made (already today,
  monthly limit, no key, BANK_SYNC_KEY missing). A failed lookup no longer blocks a retry for a day.
- Net worth: the "Edit values" form under Assets is gone. Home comes from the estimates in Setup
  ("estimate" links there). `src/app/insights/debt/assets-form.tsx` is no longer used and can be deleted.

### Fixed
- Accounts: switching between accounts in the editor kept the first account's card details
  (name, close and due days, 0% end date, color), so they showed, and could be saved, on the
  wrong card.

## [0.88.3]

No migration. The phone app is unchanged (its delete still turns an item with history off).

### Changed
- **Removing a bill deletes it for good**, with its recorded payments, planned amounts and bank
  matching. Before, a bill with history was only turned off and stayed in the list. The bank
  charges it was matched to stay and count as spending: pick a category for them when removing,
  or leave "Their usual category". To keep a bill's history, set Status to Inactive instead.

## [0.88.2]

No migration. The phone app is unchanged.

### Changed
- **Review:** the columns are now "Action items" and "Recorded automatically" (bill payments
  matched from the bank feed in the last 10 days).
- **Accounts:** the Net worth link is gone from the header.

### Fixed
- Bills turned off in Bills & income (inactive) no longer collect payments from the bank feed on
  their own. An old imported row, such as a duplicate named "Amazon (2)", was picking up charges.

## [0.88.1]

No migration. The phone app is unchanged.

### Changed
- **Home value, blended by freshness:** typed-in estimates and RentCast's are averaged together,
  counting only current ones (a site's for 6 months, the county's for 15, RentCast's for 45
  days); with none current, the newest one stands. It's re-checked every hour, so stale ones drop
  out on their own. Setup shows the value net worth uses and which estimates went into it.
- **History:** every estimate entered or looked up is kept with its date (Setup → Home value →
  History).
- **Remove saved key:** a RentCast key saved in Setup can be removed (RENTCAST_API_KEY in the
  environment, when set, is the one used).

## [0.88.0]

No migration. The phone app is unchanged. New optional setting: `RENTCAST_API_KEY` (see
.env.example).

### Changed
- **Accounts:** a tile per group with its total (plus Empty and Hidden when there are any); the
  chosen group's accounts as one table (balance, card terms, last activity); editing an account
  (type, card name, statement and due days, 0% end, color, hide) opens in a panel beside it
  instead of a form under every card. The bank feed's status is one line at the top.
- **Transactions:** one month at a time (‹ ›), 20 rows a page, a search box with account and
  category, and quick filters: Needs a category, Guessed (with counts), Money in, Transfers &
  card payments. Beside it, the month's income received, everyday spending and bills paid, from
  the month plan so they match Insights, and the top categories (each opens its charges).
- **Review:** two columns. Needs you: bills that look paid, due days the bank moved, charges
  that repeat. Done for you: grouped by bill ("Water · 12 months recorded"), each opening to its
  months with Undo.
- **Setup, categories without a budget:** each shows how often it was used in the last year, the
  latest charges and a link to them, with Put it in… or Remove category. The alert reads as a link.
- **Home value:** County appraisal always shows as a row, even after other estimates were saved.
- **RentCast:** the key can come from `RENTCAST_API_KEY` in the server's environment (it never
  touches the database). Lookups: one a month on their own, one a day by hand, and never more
  than 5 in a calendar month (failed ones count), shown in Setup.

## [0.87.1]

No migration. The phone app is unchanged.

### Changed
- **Home value:** a County appraisal row joins Zillow, Redfin and Realtor.com, and the address
  sits at the top. With it filled in, each source has a "Look up ↗" link for that home: Zillow
  directly, the others through a search, and the county through a search for that area's
  appraisal district, so it works for any address in the US. The county value counts in the
  average like the others and is flagged as out of date after a year (sites after three months).
- **Setup:** the Bills & income and Categories links are gone from the tab row.

## [0.87.0]

No migration. The phone app is unchanged.

### Changed
- **Home value** (Setup): type in the estimates from Zillow, Redfin, Realtor.com or any other
  source; their average becomes the Home value in net worth, with the range shown. Each keeps the
  date it was entered, and a note appears once they're over three months old. RentCast is still
  there, folded away, for anyone with a key; typed-in estimates take priority.

## [0.86.0]

No migration. The phone app is unchanged.

### Added
- **Home value from RentCast** (Setup → Home value): an address and a RentCast API key (sealed
  with BANK_SYNC_KEY) look up the estimate and its range, which becomes the Home value in net
  worth. It refreshes once a month on its own; "Look up again" asks now (at most once an hour).
  RentCast (api.rentcast.io) is the only outside host besides the bank feed, through the same
  guarded client.
- **Check the raw feed** (Settings → Bank sync): one account's last 30 days exactly as SimpleFIN
  sends them, every field, to see what the bank includes. A live request; six a day at most.

### Changed
- **Setup tab, redone as a list and a detail:** budgets down the left by kind, the chosen one on
  the right (name, kind, limit, usual and this month, categories to take out or add). The 0% debt
  payment and the checking cushion sit in a bar on top (saved as you leave the box), with an alert
  that opens the categories still without a budget. New budget, the kinds explained and "start
  over with the suggested budgets" are under + New budget. Bills & income and Categories links sit
  next to the tabs.

## [0.85.0]

**Migration 0026** (runs on start): `LineItem.payoffEscrowCents`. The phone app is unchanged.

### Added
- **Escrow on a mortgage:** the Debt tab asks how much of the payment is escrow (taxes,
  insurance). The payoff date, interest to go and payoff chart then use principal and interest
  only. A typed balance is now walked forward through each payment since with interest added and
  escrow left out, instead of taking whole payments off.

### Changed
- **Insights tabs:** Settings is now **Setup**, at the end.
- **Calendar:** a past row matched to a bill or paycheck shows its name (not the bank's text). Days
  are taller (up to four lines) and fill the screen height.
- **Debt & net worth:** Own is **Assets**, Owe is **Debt**; the net worth line reads "assets −
  debt".
- **Year plan:** a payment that came a month early or late (a miss beside a payment in a month
  with no plan of its own) shows "in Apr" instead of "Not paid", and the payment counts as paid.
  Rows with the same name in a part (two paychecks both named "Acme Pay") show as one row.

## [0.84.0]

No migration. The phone app is unchanged.

### Changed
- **Calendar:** one month at a time (‹ › to move). Every day is the same size, with up to three
  lines and "+N more". Past days are one color (actual), days ahead another (forecast); a day
  forecast under the cushion is amber, below $0 red, with a legend. Same-named rows on a day are
  one line ("Exchange ×3"). The two explanation lines are gone; the accuracy line shows only once
  there are saved forecasts to compare.
- **Cash chart:** about six months of history load with the page, and "‹ Earlier", "Now" and
  "Later ›" slide the chart instead of reloading. All three stay on screen (greyed out at either
  end), with the dates shown beside them.
- **Debt & net worth:** Own is grouped (Cash, Retirement, Investments, Crypto, then values you
  entered), each group opening to its accounts, with readable names (no feed ids; "401(k)",
  "Thrift Savings Plan", last four once). With a home value entered, the net worth card shows
  home equity (home less mortgage). The three cards sit at the same height; the trend line and
  the loans/cards summary line are gone.
- **Year plan:** hover any trend bar or cell for what was paid and planned. A $0 plan, or a month
  before a row's first recorded payment, is no longer "Not paid", and the totals skip those
  months. "Paid from what's left" items sit under Card payments. The comparison with last year
  reads as two figures (this year, last year, same months). Tighter columns, so the table fits;
  the note under it is gone.

## [0.83.0]

**Migration 0025** (runs on start): two new tables, `ForecastPoint` (checking's forecast as it
stood each day) and `NetWorthSnapshot` (net worth each month). The phone app is unchanged.

### Added
- **Cash tab, history:** the chart now shows what checking actually held before today (worked
  back from the bank's balance and checking's transactions), and the forecast made a week before
  each of those days. "‹ Earlier", "Later ›" and "Now" move the 60-day window.
- **Calendar, past days:** days before today show what actually happened: checking's bank rows
  and its closing balance, and under it the forecast made a week before and the difference.
  Scroll back a month at a time. A line on top says how close the week-ahead forecasts were over
  the last 30 days (average miss, which way they lean, the biggest miss).
- **Forecasts are saved** every hour (the last run each day stands) and kept about four months,
  so the history and accuracy fill in from the day this version is installed.
- **Net worth** on the Debt tab, now **Debt & net worth**: what you own (bank balances that
  aren't debt, plus values you enter, like a home or a car) less everything owed on loans and
  cards. Saved each month, so a trend builds from here. The loans table, credit cards and payoff
  chart stay below.

### Changed
- **Year plan:** no title or line under it. The table is split the same way as the other tabs
  (Income, Bills, Debt payment, Card payments, Paid from what's left), each cell tinted paid, over
  plan, not paid or planned, with a small trend per row and the current month marked. The bottom
  row is income − bills & debt. A summary beside it (below it on a laptop): income received, bills
  paid of planned, debt payments, income − bills & debt, bills by category, and bills against the
  same months last year. The bars-by-month chart is gone (it repeated the table).
- **Accounts:** the net worth box is gone (it was checking minus cards only, leaving out loans
  and anything owned); a link points to the new one.

## [0.82.1]

No migration. The phone app is unchanged.

### Changed
- **Calendar:** each day has a shaded background and a stronger border, so the days stand apart.

## [0.82.0]

No migration. The phone app is unchanged. **Delete `src/app/insights/cash-timing.tsx`**: the new
Cash tab replaces it.

### Added
- **Calendar tab** (Insights, after Cash): checking's money in and out on each day through the
  end of next month, with the balance after each day that has something on it. Amber below the
  checking cushion, red below $0, a ring on the lowest day. Worst or best case.

### Changed
- **Cash tab, redone:** a Worst case / Best case switch (worst = this month's Essentials and
  Extras budgets get spent on the cards and leave checking with the first card payment next
  month, as on the Overview's Outlook). Four figures on top (checking now, lowest, next payday,
  the last day), a chart with both cases, dollar amounts on the side, payday dots and the low
  point, then what each paycheck pays, or switch to **List** for one running register.
- The Overview's **Projected bank balance** follows its worst/best switch, so it matches the Cash
  tab. What's left of the budgets now comes from one place for every tab.

## [0.81.0]

No migration. The phone app is unchanged.

### Changed
- **Trends, rebuilt as three views** that each fit one screen, picked next to the month:
  - **Categories** (opens first): where the month's everyday spending went, one bar per
    category with a line at the usual (the three full months before) and ▲▼ against it. Sort by
    biggest or most changed; a bar opens its charges. Top merchants beside it. The categories add
    up to Everyday spending on the Money tab.
  - **Months:** income against expenses for up to 12 months, income − expenses under each; the
    open month is projected the Budget tab's way. "Everyday only" swaps expenses for everyday
    spending. Beside it, the month against usual: income, bills, debt payment, everyday spending,
    unplanned, and income − expenses.
  - **Suggestions**, three across.
  Every figure now comes from the month plan, the same source as the other tabs. Removed as
  repeats: the four boxes at the top, "In minus out, by month" (worked out from bank deposits,
  so it disagreed with the rest), "Everyday spending, by month" (now the Everyday only switch)
  and "What changed" (now the ▲▼ on each bar).
- **Overview:** the four tiles sit at the top. "Details" sits on the Projected bank balance
  heading, and the line under the balances is gone.

### Fixed
- A month that's over no longer adds the previous month's unpaid bills to its own. They already
  count in their own month, so a missed bill counted twice in history (Trends, the Overview's
  Trends tile, past months on the Tracker). The open month still includes past-due bills, since
  they're still owed.

## [0.80.0]

No migration. The phone app is unchanged.

### Changed
- **Overview tiles** are shorter. The Money tile lists Checking (current month only), Income and
  Expenses for the month, with no line under it. Expenses matches the Money tab's total. The
  Trends tile reads "<Month>: income − expenses."

## [0.79.1]

No migration. The phone app is unchanged.

### Fixed
- The Money tab's **Bills** line left out Subscriptions & autopay, so it didn't match the Bills
  figure on the other tabs. It's now one Bills line with the same total; its page lists bills and
  subscriptions & autopay under their own headings.

## [0.79.0]

No migration. The phone app is unchanged.

### Changed
- **One Bills figure everywhere.** The Tracker's "Bills this month," the Overview's Income vs
  expenses, the Budget tab's Bills row and the Money tab's Bills plus Subscriptions & autopay now
  all count the same thing: the bills on the bill list, each at what was paid or, if not paid
  yet, what's planned, plus any past due. Left out of it, and shown on their own:
  - the **debt payment** (its own row on every tab; on the Tracker, under the total);
  - **card payments** (the cards' charges already count as spending; on the Tracker, under the
    total);
  - **charges that may be bills** (their own row on the Overview and the Budget tab).
  The month's money math is unchanged; only how it's split into lines.
- **Budget remaining** reads "Budget − spent − unplanned" and "Budget − projected − unplanned."
- A budget opened from the Money tab's chart goes back to the Money tab; one opened from Everyday
  spending goes back there. The chart is titled "Everyday spending by budget."

### Fixed
- The Overview's Income vs expenses card had a list item inside a list item, which made the page
  re-render once on load.

## [0.78.0]

No migration. The phone app is unchanged.

### Changed
- **Money tab, Expenses:** each line (Bills, Subscriptions & autopay, Debt payment, Charges that
  may be bills, Everyday spending) opens its own page instead of unfolding in place. Everyday
  spending's page opens each budget's page, and that page goes back to Everyday spending.
- **Spending by budget:** a new chart under Income and Expenses, and at the top of Everyday
  spending. Budgets run biggest first, colored by Essentials, Extras or Unplanned, with a darker
  to lighter shade of that color for each smaller budget in the same group. A budget's own page
  uses the same shade.

## [0.77.0]

No migration. The phone app is unchanged.

### Changed
- **Money tab, "Charges that may be bills":** one list of charges in a bill category that aren't
  on the bill list, plus charges that repeat every month (moved here from Subscriptions &
  autopay). Each bill-category charge offers three choices:
  - **Link to a bill:** pick from this month's bills, best guesses starred (same category, a
    shared word in the name, or the same amount). It pays the right month, or links to a payment
    already recorded without a charge, and refuses a bill that already has its charge.
  - **New bill:** refused when the merchant is already some bill's, with a pointer to Link.
  - **Not a bill:** pick an everyday category; this charge and the merchant's later ones move
    there.
  The old one-click "It's <bill>" guess is gone.
- **Everyday spending** no longer offers "Make it a bill" on every charge. Each budget opens its
  own page: its categories with bars, then each category's charges, newest first, with the
  merchants that add up to the most named on top.
- **Budget tab:**
  - The top-left card is "Budget remaining," with "Today" ("Current spend + unplanned") and
    "Projected by Nov 30" ("Projected spend + unplanned").
  - Unplanned's Remaining shows what was spent as a negative.
  - The "Click a group" hint is gone, and the checking card says "End of Dec."

### Fixed
- A car wash named an "auto spa" is filed as **Car wash** (in the Fuel budget), not Personal
  care. New tolls and parking charges guess **Parking & tolls**, not Auto.

## [0.76.0]

No migration. The phone app is unchanged.

### Changed
- **Budget tab, top-left card:** unplanned costs now count against the Essentials and Extras
  budgets. "Left today" is the budgets minus everything spent, unplanned included ("$3,900 spent,
  $1,000 of it unplanned"). "Projected by Nov 30" adds unplanned so far to the projection. It
  matches the "Total without bills & debt" row. The heading reads "Spending · $X budgeted for
  Essentials and Extras · unplanned costs count against it."

## [0.75.0]

No migration. The phone app is unchanged.

### Changed
- **Budget tab:**
  - The groups fold. A group opens on its own when one of its budgets is over or heading over;
    the rest show just their total row until clicked, so the table usually fits on one screen.
  - The key is only solid = actual, lighter = projection, line = budget.
  - Totals use the muted gray instead of black.
  - Colors: a projected overage is amber (a warning). Red is for what has happened: a negative
    Remaining, or an overage in a month that's over.

## [0.74.0]

No migration. The phone app is unchanged.

### Changed
- **Budget tab:** under **Total**, a second line, **Total without bills & debt**: the budgets and
  unplanned spending only, with the same bar and columns.

## [0.73.0]

No migration. The phone app is unchanged.

### Changed
- **Budget tab:** the group rows (Bills & debt, Essentials, Extras, Unplanned) are shaded bands
  with a gap above each, and the rows under them show their amounts lighter, so the totals read
  across. The sentence about checking going up or down is gone; the planned cushion line stays.

## [0.72.0]

No migration. The phone app is unchanged.

### Changed
- **Budget tab:**
  - A **Bills & debt** group at the top: bills paid of the month's total, and the debt payment,
    "as planned." The **Total** row now covers the whole month: bills, the debt payment, the
    budgets and unplanned.
  - One key at the top of the table: each group's color, solid = actual, lighter = projection,
    line = budget.
  - The Total bar is dark for actual and pink for unplanned, meeting on a straight edge.
  - Column headers sit on two lines: "Projected spend" (the month's total at this pace) and
    "Projected by Nov 30" (over or under).
  - The bar column is headed "Actual · Projection · Budget." The top-left card says "Projected
    spend $X."
  - The checking sentence says why: "bills, the debt payment and projected spending come to $X
    more than this month's income."

## [0.71.0]

No migration. The phone app is unchanged.

### Changed
- **Budget tab:**
  - The top-left card shows what's **left today** (green, or red when over) and what's
    **projected** by month end.
  - The checking card reads as balances: the 1st of this month, the 1st of next month
    (projected), and the end of next month at this spending rate. Under them, one plain
    sentence: "Checking goes down $X this month. At this rate it reaches your planned cushion
    in about N months." Then "Planned checking cushion $X."
  - The table has a **Remaining** column (budget minus spent). "Forecast" is now
    **Projection**, and the last column is "Projected by Nov 30."
  - In the Total bar, unplanned shows as stripes of the spent color, so solid, stripes and light
    read as one run.
  - The table no longer scrolls on a wide screen. The note and the "Change budgets" link under
    it are gone, and "Unplanned, so far" is just "Unplanned."
- **Tracker** has a table icon.
- The Settings menu item and page are **Bills & income** again.

## [0.70.0]

No migration. The phone app is unchanged.

### Changed
- **The Budget tab is a forecast table.** Each budget shows spending so far (solid), where it's
  heading by month end at its daily rate so far (lighter), and its budget (a line), with Spent,
  Budget, Forecast and "By Nov 30" (over or under) on the right. Essentials, Extras and Unplanned
  each get a total row. A budget made of one monthly charge counts once; unplanned costs count
  as spent and aren't forecast. A **Total** row at the bottom adds unplanned to the bar in its own
  color against the total budget. A past month shows how it ended.
- **Two cards on top:**
  - the budgets' forecast against Essentials plus Extras;
  - the **checking cushion**: what checking holds once every card and bill is paid, at the start
    of the month, forecast for the 1st of next month, and a month later if the next month goes
    the same. It also says how many months it lasts at this rate before reaching the minimum.
- **Minimum cushion** (Insights → Settings): the least checking should keep once every card and
  bill is paid. Available to spend holds it back, and its Details list it.
- The safe-to-spend card, the pace chart and the budget cards are gone from the
  Budget tab; budgets are still changed in Settings.
- **"Bills & income" in the sidebar is now "Tracker."**

## [0.69.0]

No migration. The phone app is unchanged.

### Changed
- **"This month" is now "Bills & income"** in the sidebar, since it moves between months. The
  page where bills and income are set up, under Settings, is now **Bill setup**, and the links to
  it say so.

## [0.68.0]

No migration. The phone app is unchanged.

### Fixed
- **Earlier months catch up.** Bills from months back whose charges are in the bank history no
  longer stay "unpaid" and "overdue." After each sync and at start, every month from a year back
  to two months ago is checked, oldest first. An unpaid bill is recorded from an unlinked charge
  when the match is sure: the merchant was confirmed for that bill before, the charge names the
  bill, or it's the bill's amount to the cent. A same-category charge counts only at the exact
  amount. Each charge is used once. Card-payment bills and bills set not to record on their own
  are left alone. This month and last month still go through the Review page as before.

## [0.67.0]

No migration; two one-time data fixes run on the first start (see below). The phone app is
unchanged.

### Added
- **Debt: one Payoff card with a button for each loan.** The 0% balance keeps its "on track?"
  chart. Every other loan shows its balance from today to paid off, at its payment and rate, with
  a dot each January. The "At $X a month…" line now starts on its own line.

### Changed
- **The Debt page fits on one screen:** the three totals in one strip; Loans, Loans missing a
  balance and Credit cards on the left; Payoff on the right.
- **Money tab expenses carry a badge like income:** Paid, Due or Partly paid for bills,
  Subscriptions & autopay and the debt payment ("$4,000 paid of $6,500"), and Actual for
  bill-category charges and everyday spending.
- **"It's Church" picks the right month.** A payment of the bill recorded in the last two months
  without a charge gets this charge linked to it. That happens when a payment was linked to a
  pending charge the bank later replaced with the posted one. A past-due bill carried into this
  month says which month it's for. Otherwise the charge pays the month it posted.
- **Subscriptions are bills.** The default budgets no longer have a separate Subscriptions budget;
  subscription, streaming and autopay categories go with the bills.

### Data fixes (run once on the first start)
- **Parking & tolls:** a new category in the Fuel budget. Every toll and parking charge (NTTA,
  toll tags, ParkWhiz, ParkMobile, SpotHero, "parking") moves into it, and the merchants are
  remembered so later charges follow.
- **Subscriptions into bills:** an existing Subscriptions budget's categories move to the bills
  group, and the budget is removed.

### Fixed
- The Insights tabs no longer push the page sideways on a phone now that the month picker shares
  their row.

## [0.66.0]

No migration. The phone app is unchanged.

### Added
- **"It's Church":** on the Money tab, a charge under "Bill-category charges not on the bill list"
  that shares its category with a bill offers to record itself as that bill's payment, in place
  of "Make it a bill." It records the payment for the month the charge posted, or links it to a
  payment already recorded that month without a charge. It also learns the merchant, so later
  charges match by themselves. The list opens on its own when it has charges in it.

## [0.65.0]

No migration. The phone app is unchanged. This zip also carries everything from 0.64.0.

### Fixed
- **Debt:** a bill whose end month has passed no longer shows as a loan, even if a balance was
  entered on it.

## [0.64.0]

No migration. The phone app is unchanged.

### Fixed
- **Card interest and fees** only count what the card itself charged: interest, and late,
  past-due, annual, member, foreign-transaction, cash-advance, balance-transfer, over-limit and
  returned-payment fees, read from the bank's description. Spending in a category with "fee" in
  its name, like sports or school fees, was being counted.

### Changed
- **Insights tabs:** the month picker sits on the same row as the tabs. The page title (kept for
  screen readers) and the line under it are gone on every tab.
- **Debt:**
  - The explanations under Loans, Credit cards and the installment total are gone.
  - When two loans pay the same amount and start with the same word, a note asks whether
    they're the same loan entered twice.
- **Sort uncategorized:** the line under the title is gone.

## [0.63.0]

No migration. The phone app is unchanged.

### Changed
- **Available to spend shows the projected bank balance:** the lowest point with its date, and
  the balance on the last date. Bills and card payments leave on their due dates, from what's
  charged so far. It replaces the always-yes check.
- **Money tab:**
  - The cards are now **Income** and **Expenses**.
  - Expenses reads "$X of $Y expected," like Income: paid and spent so far, out of the bills in
    full, the debt payment and spending.
  - The footer reads "Income minus expenses."
  - Everyday spending is described as "Essentials, Extras and Unplanned."
  - The description under the title is gone.
- **Managed for others** only shows people with money moving in the month you're viewing. The
  balance is labeled as all time.

## [0.62.0]

No migration. The phone app is unchanged.

### Changed
- **Available to spend** has one check: spend all of it and every card is still paid in full,
  with every bill paid through the date shown. The "stays within this month's income" check and
  the "income after its expenses" line are gone. This figure is about the current balance and
  paying the cards in full, not the month's income on its own.
- "How it's worked out" is now **Details**. The popup starts from **Current balance**, has no
  "spending more than this leaves a bill short" sentence, and can be **dragged by its title bar**.

## [0.61.0]

No migration. The phone app is unchanged.

### Changed
- **Available to spend is compact:** the figure with "until" its date, two checks ("every bill
  paid if all of it is spent," "stays within this month's income"), and **How it's worked out**,
  which opens the line-by-line breakdown in a popup.
- **One Worst case / Best case toggle,** on the Outlook, drives both cards. The card shows which
  case it is.
- The right column stretches so Available to spend ends level with Income vs expenses.

## [0.60.0]

No migration. The phone app is unchanged.

### Changed
- **Available to spend shows how it's worked out, line by line:** checking today, this month's
  pay still coming, bills, cards and debt still owed, budgets left used in full (worst case),
  then each paycheck and the bills up to the tightest point. Under that:
  - whether every bill through the last date is still paid if all of it is spent;
  - this month's income after its expenses (worst case also takes off the budgets left);
  - whether spending all of it stays within this month's income.
  The heading matches the other cards, and "Good through" is now "Until."
  The "spend it all" lines are gone.
- **Outlook:** "Bills after Dec 4." The results read "Before Dec 4 pay" and "After Dec 4 pay,"
  as plain amounts, green or red. The "Plus November's budgets still to be charged" line is gone,
  since the worst case already counts it.
- **Carries over:** "Best case · if spending stopped now" and "Worst case · all budgeted funds
  are used."

## [0.59.0]

No migration. The phone app is unchanged.

### Changed
- **The Outlook is one bar of bills over time.** It has no income bar. The bills and the debt
  payment are in date order: due before payday in the darker shade, from payday on in the lighter
  one, then what's left in green. The full width is all the money coming in. Two lines:
  - a solid line where the carry-over plus income before payday (a monthly benefit) runs out;
  - a dotted line at payday, where the bills switch from before to after.
  When the dotted line is left of the solid one, the bills before payday are covered.
- Two lines under the bar match the marks: "Carried over + VA pay" with its total, and the
  paycheck with its date and amount.

## [0.58.0]

No migration. The phone app is unchanged.

### Changed
- **The Outlook is one chart:** a money-in bar (the carry-over, then each deposit in the order it
  lands) above a money-out bar (bills and the debt payment in date order, then what's left), on
  the same scale. A payday line runs through both where the paycheck lands. Bills due before
  payday are the darker blue and have to end left of the line to be covered. Under it: what's
  left before payday and before the paycheck after it.

## [0.57.0]

No migration. The phone app is unchanged.

### Changed
- **The Outlook splits at payday.** The first stretch runs from the 1st to the day before the
  next paycheck: the carry-over plus any income landing before payday (a monthly benefit), its
  bills, and what's left. The second runs from payday to the day before the paycheck after it:
  what's left plus the paycheck, its bills and the debt payment, and what's left. Both bars share
  one scale. Hovering "Bills" lists them.
- **Worst case / Best case** on the Outlook and Available to spend, kept in step. Worst case starts
  from the carry-over with this month's budgets used; best case with current expenses only. The
  bank check's two figures are labeled the same way.
- **Available to spend** names the tightest stretch, what's left at the end of each stretch if all
  of it is spent today, and that every bill through the last date is still paid. Its note reads
  "Available funds using current and budgeted expenses" or "…using current expenses only."
- **Click the ring** (or tab to it and press Enter): the middle shows that part, like
  "$669 essentials spent." Click it again, or the middle, to go back.
- "Left to spend" is now **Remaining**.

## [0.56.0]

No migration. The phone app is unchanged.

### Added
- **Available to spend on Overview**, in place of "safe to spend / over by." It's the most that
  can go out today without any later bill coming up short, in the worst case. It starts from what
  this month carries over with the budgets fully used, then walks the Outlook's pay and bills up
  to the day before the paycheck after next and takes the lowest point. It shows how long the
  figure holds, the bill where spending it all would bring checking to $0, that every bill and
  card payment through that date is still paid, and what's left before that paycheck. Past months
  still show the month's own figure.

### Changed
- **The Outlook is just the chart:** the toggle, the summary bar and the card lines. The pay and
  bill lines are gone; hovering "Bills" lists them.
- Removed the "Checking covers every bill…" box from Overview. The Cash tab still has it day by
  day.

## [0.55.0]

No migration. The phone app is unchanged.

### Changed
- **The Outlook's summary box looks like the bank check:** "Carried over $X + VA pay + paycheck,"
  a bar split into bills, the debt payment and what's left, a tick where the carry-over ends, and
  the "Left before the paycheck" line.
- **Card lines tell a statement from charges still building:** "$515 statement due Dec 9" vs.
  "$156 charged since the last statement, next statement closes Dec 3." They used to show each
  card's whole balance as its next payment.
- The Outlook sits at the top of the right column, above safe to spend.
- Removed the "Spending in December goes on the cards…" line, and the description under the
  Overview title.

## [0.54.0]

No migration. The phone app is unchanged.

### Changed
- **The Outlook is a short summary.** Under the carry-over: other income, like a monthly benefit,
  on its own line; one line totaling every bill and the debt payment up to the day before the
  paycheck after next ("Show the bills" opens the list); then the paycheck's date and estimate;
  then the bottom line. The line-per-bill list with a running balance is gone. The Cash tab still
  has it day by day.

## [0.53.0]

No migration. The phone app is unchanged.

### Added
- **Outlook on Overview**, in place of "Can we afford it?" It looks at next month from the 1st
  to the day before the second paycheck. It starts from what this month carries over, then lists
  the pay and the bills from checking in date order, with checking after each one. The last line
  says what's left before that paycheck, or in red, when and by how much checking comes up short.
  - A toggle switches the starting point between **Right now** and **If budgets are used**, the
    same two figures as the bank check.
  - The next card payments are listed, already set aside in the carry-over. With budgets used,
    they also include the rest of this month's budgets still to be charged, as an estimate of the
    next statements. Bills charged to a card in that stretch are listed separately.
  - The paycheck is the income that lands more than once a month, as one line item or as numbered
    ones ("Paycheck", "Paycheck 2"). Other income, like a monthly benefit, is listed as it lands.

## [0.52.0]

No migration. The phone app is unchanged.

### Changed
- **Overview:** Income vs expenses moved to the left column, with safe to spend, the cash line and
  "Can we afford it?" on the right.
- **Budget left** is just Essentials and Extras now, one figure against left to spend. The debt
  payment is counted in full like a bill, so it isn't a budget to spend down. The bank check's
  "if the budgets are used" figure matches.
- The note under "Carries over" now reads: what checking would hold on the 1st if every card were
  paid to zero that day, after this month's bills and debt payment.

## [0.51.0]

No migration. The phone app is unchanged.

### Changed
- **Two carry-over figures in the bank check:** "Right now," and "If the budgets are used," which
  also sets aside what's left of the Essentials and Extras budgets. On the bar, those budgets show
  in their own lighter colors between what's owed and the green carry-over.
- **Budget left is compared with left to spend** on the side ("$650 of $2,000 left to spend"),
  using the Essentials and Extras budgets. The debt payment is already out of left to spend. It
  turns amber when the budgets left are more than what's left to spend.
- The tick where today's balance ends now sticks out above and below the bar.
- Hovering anywhere on the dashed "left to spend" part of the ring shows its amount.
- Each bank-check piece explains itself on hover. "Owed on cards" is spending and bills already
  charged to a card.
- "About" is gone from the carry-over.

## [0.50.0]

No migration. The phone app is unchanged.

### Changed
- **Budgets for reference beside Income vs expenses.** The Essentials and Extras bars show what's
  left of their budget in a lighter shade, the way Bills shows what's still due, and say
  "of $X budget." A new "Budget left" bar puts what's left of the Essentials, Extras and debt
  payment budgets side by side in their own colors. Budgets never enter the ring or "left to
  spend"; Unplanned has no budget, so it isn't there.
- **The bank check ends with what carries over to next month:** checking once this month's bills,
  the debt payment and every card balance are covered. It replaces the "after every card and bill
  is paid" line. "Carries over" also has its own swatch on the bar.

## [0.49.0]

No migration. The phone app is unchanged.

### Changed
- **A bank check under Income vs expenses** replaces the "so far this month" sentence. It starts
  with checking today plus the pay still coming this month, then takes off what's already owed:
  everything on the cards (they're paid to zero, so it all leaves checking), bills still due from
  checking, and the debt payment. One bar shows how much of it is spoken for. A tick marks where
  today's balance ends. The last line says what checking holds once every card and bill is paid,
  and how much of that is this month's leftover vs what the month started with. When it comes up
  short, the line turns red. It links to the Cash tab for the day-by-day view.
- A 0% card's balance isn't counted as owed now; only its monthly payment (the debt payment) is.
- `/api/v1/cash` also returns these figures as `check`.

## [0.48.0]

No migration. The phone app is unchanged.

### Changed
- **Overview's donut is now "Income vs expenses."** The full circle is the month's expected income.
  The outer ring fills as income arrives, and a dark tick marks how much has come in. The inner
  ring holds expenses on the same scale: what's already paid or spent comes first (essentials,
  extras, unplanned, the debt payment and paid bills), then bills and the debt payment still due
  (pale), then what's left to spend (dashed). Spending past income shows as a red arc outside the
  circle. Everyday categories show actual spending only, no budget amounts; bills and the debt
  payment show their full amounts.
- Beside the ring, each row has a thin bar on the same scale. Below it, one line says how much of
  the income received so far hasn't gone out yet, or how much more has gone out than come in.

## [0.47.0]

Run the migration (restart the container): it adds a loan's interest rate. The phone app is
unchanged for now; its Insights will follow the same tabs next.

### Changed
- **Insights is a set of short pages** with tabs across the top: Overview, Money, Budget, Cash, Debt,
  Trends and Settings, beside Year plan. Nothing was removed; each section moved to the tab that
  answers its question. The month being looked at carries across the tabs that are about a month.
  - **Overview:** safe to spend, the donut, a one-line cash check, "Can we afford it?", and a tile for
    each tab with its headline.
  - **Money:** money in (expected against received) and money out as it happens, with no budget
    amounts: bills, Subscriptions & autopay, the debt payment, and everyday spending by kind, budget,
    category and charge. Coming up and Managed for others moved here.
  - **Budget:** each budget against its limit, and the pace chart.
  - **Cash:** whether checking covers every due date.
  - **Debt:** see below.
  - **Trends:** the month comparisons, charts, where it went, what changed, top merchants and
    suggestions.
  - **Settings:** limits, budgets and their categories, and the 0% debt payment. The old Set up the
    spending plan page sends you here.
- **Guardrails are called limits.**

### Added
- **Debt tab.** Loans (installment debt) with balance, payment, interest rate and payoff date, counting
  interest when the rate is known, plus the 0% balance; loan-looking bills without a balance are
  listed to fill in the balance and rate. Credit cards (revolving debt) with balance, what's due,
  whether the statement is paid, and interest and fees charged this year. Totals for each.
- **Subscriptions & autopay.** Charges that come every month on their own are bills in one category,
  rolled up on the Money tab. Repeating charges in the bank that aren't bills yet are listed in it with
  "Make it a bill" (it lands in that category) or "Not automatic".
- Bills carry their category in the month plan.

## [0.46.0]

### Changed
- **Where this month's money goes** is a donut: the circle is the month's money in, cut into bills,
  the debt payment, essentials, extras, unplanned and what's not spent yet, with the amount left (or
  over) in the middle. When everything out passes money in, a red outer ring marks the part past it.
  It now sits right under the plan.

### Fixed
- A card payment whose other side hasn't arrived from the bank yet (the payment has left checking but
  the card hasn't posted it, or the reverse) no longer counts as spending or as a refund while it
  waits to be paired.

## [0.45.0]

### Added
- **Charts that decide**, on Insights under the plan, each with its numbers on hover:
  - **Where this month's money goes:** one bar of money in, split into bills, the debt payment,
    essentials, extras and unplanned, with what's not spent yet (or a mark where spending passed
    money in).
  - **Are we on pace?** What's left in the pool each day against spending it evenly.
  - **Is the 0% balance on track?** Its balance since it moved, where it heads at this month's
    payment and at the payment that clears it, against the end of the offer.
  - **Did each month live within its money?** Money in against everything out for the last six
    months, with in minus out under each.
- Chart series colors are a fixed, validated order in light and dark.
- The month plan carries spending by day; `GET /api/v1/plan/charts` gives the months and the 0%
  balance to the phone.

## [0.44.0]

### Added
- **Will checking cover it?** on Insights: checking day by day through the rest of this month and next.
  Paydays add their pay; every bill paid from checking and each card's payment in full (this
  statement, then what's been charged since) come out on their due dates, and the 0% card's monthly
  payment on its own. A chart of the balance, the lowest point, and a warning ahead of any day it
  would go below zero. Each paycheck lists the whole payments due before the next one.
  `GET /api/v1/cash` for the phone.
- **Make it a bill** on a charge (in the plan's transactions and in bill-category charges): a monthly
  bill from that merchant's usual amount and day, tied to the merchant, with this charge recorded as
  this month's payment. `POST /api/v1/bills/from-charge`.
- Bills match charges in the **same category** too, so a bill whose name shares nothing with the
  merchant (and whose amount varies) is still offered on Review.

### Changed
- **Simpler bill form.** A bill asks only how it's paid: from checking, or on a card (and which). A card
  payoff asks which card and where it's paid from; "paid from what's left over" belongs to card
  payoffs only. A bill the bank treats as a card payment says so, with a box to say it isn't.
  "Half of the month" is tucked away.

## [0.43.0]

Run the migrations (restart the container). Then, on Insights → Set up budgets, press **Start over
with the suggested budgets** once, so the budgets match the new kinds. Delete these files if you copy
the release over an older tree (they are emptied here): `src/lib/envelopes.ts`,
`src/lib/__tests__/envelopes.test.ts`, `src/app/insights/envelopes.tsx`,
`src/app/insights/plan-charts.tsx`, `src/app/api/v1/envelopes/route.ts`.

### Changed
- **The spending plan is monthly.** One pool per calendar month: money in, less every bill due that
  month (whole, paid or not, plus unpaid ones carried from before) and the 0% debt payment. Pay
  periods no longer slice the budget.
- **Safe to spend** is the headline: what's left in the pool after everything spent and the essentials
  still to come. An extra's room is never more than safe to spend, so an overspend anywhere (an
  essential, a repair, another extra) shrinks every extra, even ones with no spending.
- **Guardrails, not money.** Budgets have a monthly guardrail; nothing carries over, and save-ups are
  gone. Automatic extras are scaled down together to fit the pool, and the gap is shown when usual
  spending is bigger.
- **Kinds of budget:** paid as bills, essential, extra and the new **unplanned** (irregular costs such as
  repairs, the vet, medical, lessons and sports fees: no guardrail, never averaged). Planned is gone.
  Giving and saving are paid as bills. Fuel is its own essential.
- The debt payment is **monthly**: the bill for the 0% card, what was paid, or an amount you set. The
  monthly payment that clears the balance before the offer ends is shown.
- "Everything else" is now **Needs a budget**, and spending without a category shows under
  **Needs sorting**; both count against the month.

### Added
- **How it adds up:** money in, bills, debt payment, pool, spent, left, essentials still to come and
  safe to spend, each opening to its items (bills with paid, due and overdue).
- Every budget opens to its categories and each category to its transactions.
- **Can we afford it?** with several purchases at once, showing the new safe to spend and which extras
  lose room.
- Earlier months on Insights show their plan too.
- A bank payment that is a bill's amount to the cent (at least $100) records the bill on its own.
- `GET /api/v1/plan?month=YYYY-MM` for the phone. `GET /api/v1/envelopes` is gone.

### Removed
- The pay-period view, payday plan card and its charts (cash timing returns as its own check).

## [0.42.0]

### Added
- **Payday plan** on Insights: with what's in checking now, the debt payment, the bills to hold until
  the next payday (listed), what to send each card (statements first, then balances, soonest due
  first) and whether that pays it to zero, and what stays in checking until payday. The phone gets
  a notification on payday morning with the plan, and one when the money left runs out.
- **Charts:** left to spend through the pay period against an even pace; paying off the 0% balance
  (history and where it heads at this payment, against the offer's end); money in against money out
  for each recent pay period.
- The headline is a **donut** of what's left by kind (essentials, planned, flexible, and any
  overage), with each kind and what it covers in words.

### Changed
- "Envelopes" are now the **spending plan**, and each line is a **budget**.
- Categories named Debt or Payment start in Paid as bills.
- The summary card is replaced by the donut.

## [0.41.0]

Run the migration (restart the container): it adds transaction splits and a "Paid as bills" kind of envelope.

### Added
- **Amazon orders.** Settings → Bank sync → Amazon orders reads Amazon's Order History.csv, matches
  each order (by shipment, then whole order) to its card charge, and splits the charge into the
  categories of the items in it: groceries, household, health, clothing, electronics and so on.
  Only the needed columns leave the browser; item names are stored encrypted. Envelopes and Insights
  count split charges by their parts. A newer file adds to what's there; "Remove all Amazon splits"
  undoes it.
- Envelopes: **This pay period / This month** toggle.
- Envelopes: a **Summary** (left and over per kind, and in total) in place of "Can I afford it?".
- Envelope kind **Paid as bills**: categories paid through the plan's bills (so step 1 already counts
  them) that the envelopes should skip, such as an investment bill paid in several transfers.
- Set up envelopes: **Start over with the suggested envelopes**.

### Changed
- The headline is everything left across all envelopes, less any overage nothing covered; the
  flexible part is shown under it.
- Bills and income come from what's due in this period (before the next payday, or this month), not
  a share of the year, so a tight paycheck shows as tight. Without a plan, a share of recent deposits.
- Flexible money no envelope needs ("Not in an envelope") now covers overages before anything is
  reported as over.
- With no plan payment toward a 0% card, the debt step holds back about the minimum (1% of the
  balance a month) instead of nothing.
- Suggested envelopes: Paid as bills, Fees & interest, Groceries & household, Vehicles, Health,
  School & lessons, Home upkeep, Pets, Giving, Sports, Saving & investing, Eating out, Clothing,
  Shopping, Subscriptions, Fitness, Gifts & trips, Fun. None set money aside (save-ups) by default.

### Fixed
- The shortfall when bills, essentials and planned spending exceed income was counted twice.

## [0.40.0]

Run the migration (`npm run migrate`, or restart the container): it adds category groups.

### Added
- **Spending envelopes**, at the top of Insights. Each pay period's income is handed out in order:
  bills, essentials, planned spending, the debt payment, and what's left is one shared pot of
  flexible money. Categories sit in groups, and a group is an envelope with a limit per pay period.
  - No envelope goes negative: one that runs over takes from the flexible envelopes with room, and
    the page says which gave. Essentials that run over draw on flexible money the same way.
  - Essentials and planned envelopes keep what a pay period doesn't use (up to two periods' worth),
    since those costs come in lumps. Save-ups keep everything, toward an optional target.
  - Limits are automatic from twelve months of spending. Set one and the automatic ones share the
    rest, so changing one moves the others; "Reset to automatic" puts them all back.
  - "Can I afford it?" shows what a purchase would take from the other envelopes. Nothing is saved.
  - The debt payment shows when the balance clears at that rate, and what it takes to clear a 0%
    balance before the offer ends.
  - The period follows the pay calendar (payday to payday); without one it is the calendar month.
- Insights → Set up envelopes: rename, add or remove envelopes, choose each one's kind, turn on
  save-ups, move categories between envelopes, and set the debt payment. A starting set is made
  from the category names in use.
- `GET /api/v1/envelopes` for the phone.

### Changed
- Insights leads with the envelopes; the month-by-month figures follow under "Looking back". The
  income bar, card budget, category targets and pace cards are replaced by the envelopes.

## [0.39.2]

### Added
- Settings → Bank sync lists "Bank data as of" for each account: when the bridge last got it from
  the bank (SimpleFIN's balance date), flagged when over a day old.
- The month view carries `billsBankDataAt`, the bills account's bank data date, for the phone.

## [0.39.1]

### Fixed
- A combined history file whose rows are all already here (an edited copy of the Transactions
  export, say) can still set categories: the button reads "Set N categories" instead of
  "Import into 0 accounts", and no empty import is listed.

## [0.39.0]

### Changed
- Bank sync runs every four hours at 17 past (BANK_SYNC_EVERY_HOURS, from BANK_SYNC_HOUR) instead
  of once a day, with a failed attempt retried after an hour. Every request, scheduled or by hand,
  counts toward a cap of 20 a day, under SimpleFIN's 24.

### Added
- `POST /api/v1/bank/sync`: read the bank now from the phone (skipped within 10 minutes of the last attempt).
- `POST /api/v1/review/repeat`: add a repeating charge as a bill, or dismiss it. The Review API lists them in `repeatList`.
- The month view says whether the bills balance follows the bank, when it was set, and the last good sync.

## [0.38.1]

### Fixed
- Health-share plans, whose names often say "ministry", are guessed as Insurance, not Giving.

## [0.38.0]

### Changed
- More categories, guessed for new charges: eating out splits into Fast food, Restaurants and
  Coffee & treats; Phone is apart from Utilities; plus Housing, Loans, School (was Education),
  Clothing, Outdoors & sports, Fitness, Alcohol, Gifts & occasions, Aquarium and Crypto.
  More gas station chains count as Fuel. Phone, Housing and Loans are essentials in the category
  targets; the new eating-out, clothing and hobby categories are flexible.

## [0.37.0]

### Added
- Bills that pay off a balance (Bills & income → Pays off a balance): a loan, mortgage or payment
  plan tracks what's left, either a balance you enter (counted down by the payments recorded
  after its date) or a loan account's balance from the bank. The list shows what's left, the
  payments to go and the month of the last one; once it reaches zero the bill ends on its own and
  drops off the plan.
- "Paying off" on Insights: each such bill with what's left, when it ends and what it frees up
  each month after. Also in `GET /api/v1/insights` (phone app 0.12).

### Upgrade
- Migration `0019_bill_payoff_balance`.

## [0.36.0]

### Added
- Sort uncategorized (Insights → Uncategorized, or "Sort them by merchant"): every merchant with
  uncategorized charges over the last 12 months, largest first, with its charge count, accounts and
  last date. One choice per merchant settles every charge from it, past and future: a category,
  or "It pays a bill" (giving, a doctor paid monthly), after which none of its charges counts as
  spending. Payment apps are listed apart, set one at a time on Transactions.
- "Spending that may be a bill": charges counted as spending in a category your bills use but not
  tied to a bill, likely a bill paid under another name and counted twice, each with "It pays a
  bill".

### Changed
- Better category guesses: doctors and dentists (pediatrics, DDS, eye care, imaging…) as Medical,
  more regional grocery chains, church names that run together
  ("…bible", "…church") as Giving, and Microsoft, Adobe and Dropbox as Subscriptions.

### Upgrade
- Migration `0018_bill_merchant_all_charges`.

## [0.35.0]

### Added
- Inviting the second person shows a QR code beside the one-time code. Scanned in the phone app,
  it asks for a username and password of their own, creates the account and signs that phone in,
  with no separate Add a phone step. The code still works on the web's "Create your account".
- `POST /api/v1/auth/join` (public, rate limited): invite code, username and password → the new
  account and the phone's token. Single use, same expiry and rules as joining on the web.

## [0.34.0]

### Added
- A budget plan at the top of Insights, from the big picture down:
  - **Where the income goes**: one bar where the whole is a typical month's income, split into
    bills from the bank, bills on cards, card spending, debit and other spending, and the 0%
    payoff, with what's left over, or the shortfall running past the end of the bar.
  - **Card budget**: what can go on the cards each month (income less bank bills, debit spending
    and the 0% payoff), split into the bills on them and room for spending. Each card (0% cards
    left out) gets its bills plus a share of the spending room by how it has been used, and
    shows, since its statement closed, how much of the balance is bills and how much is spending,
    the bills still to come, and the spending room left.
  - **Category targets**: the everyday budget shared out: essentials (groceries, Costco & Sam's
    Club, fuel, medical, utilities, insurance, pets) keep their usual amount and flexible
    categories come down together to fit, each with this month against its target.
- Also in `GET /api/v1/insights` (phone app 0.10).

### Changed
- The spending limit card is replaced by the budget plan, which carries the same numbers.

## [0.33.0]

### Added
- Spending limit on Insights: the most everyday spending (cards and debit together) can be each
  month and keep within the plan: typical income less fixed bills less the 0% payoff payments,
  each averaged over the next 12 months (so yearly bills and three-paycheck months count for their
  share). Card payments aren't counted as bills, since they pay for that spending; the card shows
  which bills it treated as card payments. Shows how far over or under the last three months ran,
  how much of it went on cards, and this month's spending against the limit with what's left per
  week. With no income in the plan, recent deposits stand in. Also in `GET /api/v1/insights`.

## [0.32.0]

### Added
- Insights charts: everyday spending by month (the month in progress shows what's still to come
  at a usual pace), and in minus out over 12 months. Months before the bank history starts are
  left off.
- What's left: next to the pace, what the bills account has after this month's bills and
  paychecks, how much everyday spending is still to come (and how much of it lands on cards, paid
  next month), and the last seven days.
- 0% payoff: each 0% balance with how much is paid down, what's left, the payments that clear it
  by the offer's end, and whether it's on track.
- The same month last year, by category and in total, when the history reaches back that far.
- Tap a category for its own page: twelve months of totals, this month's merchants against their
  usual, and the charges. Also `GET /api/v1/insights/category`.
- `GET /api/v1/insights` carries everything the web page shows (phone app 0.8).

### Changed
- Suggestions say what was actually spent: "Dining: about $310 a month lately, up from $200",
  with each month's amount and a small chart. One big month is now a "spike" ("Hockey: $3,800 in
  Oct", with the largest charge) instead of a rise. Months before the history starts no longer
  count as $0.

## [0.31.0]

### Added
- Coming up on Insights: yearly charges (memberships, renewals, registrations) expected in the next
  45 days, found from bank history: charged around the same date two years running, or once a year
  ago when it reads like a renewal. "Add as a yearly bill" plans it in its month; "Not yearly"
  hides it. Also in `GET /api/v1/insights` (phone app 0.7).
- Card payments record themselves. A card-payment bill learns which card it pays, from payments
  recorded by hand that match payments reaching a card, or from a name it shares with one card
  (Line items → Pays a card to pick it yourself). Each payment reaching that card is recorded for
  the month it pays, whatever the amount, tied to the checking side of the transfer, with Undo on
  the Review page.

### Upgrade
- Migration `0017_bill_pays_card`.

## [0.30.0]

### Added
- Pace on Insights for the month in progress: everyday spending so far against where a usual month
  is by the same day, and what the month is on pace for. Also in `GET /api/v1/insights` (phone
  app 0.6).
- Two more kinds of suggestion, to catch smaller charges: new monthly charges (charged the last two
  months and not before) and monthly charges whose price went up.

### Changed
- Target and Walmart have their own category, "Target & Walmart", and Costco and Sam's Club theirs,
  "Costco & Sam's Club"; Groceries is for grocery stores. Fuel at those stores counts as Fuel.
  Guessed categories update on their own; a merchant set by hand keeps its category.
- Repeating-charge suggestions include charges from $1 a month and list up to 12.
- `GET /api/v1/insights` suggestions carry their items.

### Fixed
- Transfers are re-checked over the last four months when the server starts, so a balance
  transfer received before 0.28 stops counting as spending.

## [0.29.0]

### Added
- Suggestions on Insights, from the last six complete months: categories that are rising, a 15%
  trim on the largest flexible categories, charges that repeat every month without being a bill,
  what card interest and fees cost, and the monthly amount that clears each 0% balance in time.
  Ranked by what acting on each would keep. Also in `GET /api/v1/insights`.
- A card can be named (Accounts → Name), shown everywhere instead of the bank's name. Stored
  encrypted.
- Card colors: an Evergreen preset, and "Pick exactly…" to match any card with a color picker. A
  preview swatch shows the choice before saving.

### Upgrade
- Migration `0016_account_nickname` adds the name column.

## [0.28.0]

### Added
- Phone API for the bank features (phone app 0.5): `GET /api/v1/cards` (cards with their
  statement picture and colors), `GET /api/v1/review` with `POST /api/v1/review/confirm`,
  `/dismiss` and `/undo-auto`, and `GET /api/v1/insights` (a month's spending summary).

### Fixed
- A balance transfer onto a card counts as a transfer, not spending, even when the other card's
  side isn't in the feed. It no longer shows up in Insights.
- Card names that repeat their digits ("Card - 1234 (1234)") show cleanly on the card faces.

## [0.27.1]

### Changed
- The card stack sits top right on This month, fanned out to the side so each card's color shows,
  and the table is back at the bottom. The front card slides out and tucks in at the back with a
  smoother motion.
- Each card leads with what to pay this cycle, then a running tally: the balance, what's on the
  current statement, and what's new since it closed. The summary card does the same across all
  cards.

## [0.27.0]

### Changed
- Cards are a stack on This month: an All cards summary on top (owed now, what to pay this cycle,
  next due date), then each card in its own color with what's owed, what to pay and by when, and
  either what's built up since the statement or how many 0% payments are left. Tap, swipe or use
  the arrows to send the top card to the back; List shows them side by side.
- "To pay this cycle" counts the monthly payoff on a 0% balance, not the whole balance.

### Added
- A color for each card (Accounts page), from plain presets. Migration `0015`.

## [0.26.0]

### Changed
- This month's blue card is now Cards: what you owe across every card right now, what's due on
  statements and the next due date. Below the bills, a Cards table shows each card's balance,
  statement due, what's built up since the statement, and what to pay. "Available to send" is gone;
  it repeated Second half remaining.
- The menu matches the design: This month, Review, Transactions, Insights, Accounts. The year plan
  is a tab of Insights, What can I pay? opens from the month's 45-day card, and line items moved to
  Settings as Bills & income.

## [0.25.1]

### Fixed
- Income follows the pay calendar. An income item can arrive on "the 1st/2nd/3rd… payday of the
  month" (line item form → Arrives on), so a 3rd paycheck appears only in months with three
  paydays, on that payday, in the month view, the year grid and the projection. Items named like
  "Pay", "Pay 2", "Pay 3" are set this way automatically. Migration `0014`.
- Income with nothing expected and nothing received (a year-end bonus in other months) no longer
  shows a row.
- The pay calendar check groups one employer's deposits even when the bank describes them two
  ways, and ignores off-cycle bonus runs, so "most recently" is the real latest payday.

### Changed
- The card Save button turns green and reads "Saved", then eases to light green.

## [0.25.0]

### Added
- The month divides at your payday: the payday nearest the 15th from the pay calendar, so each
  half is what one paycheck covers (every two weeks, twice a month or weekly; a three-paycheck
  month's third check is extra). Settings → Planning can still use a fixed day.
- Pay calendar from your deposits: Settings → Pay calendar shows the schedule your paycheck
  deposits follow and, when the calendar doesn't match, a Use this button.
- Card payments: each card on the Accounts page takes its statement closing day, payment due day
  and the end of a 0% offer. This month lists each card's next due date and what to pay: the full
  statement on cards that charge interest, or equal payments that clear a 0% balance before the
  offer ends. Migration `0013`.
- The combined history file can carry a Category column (and Managed for others = yes). Labeled
  rows get that category, and a merchant labeled the same way on every row is remembered.

### Changed
- Payment-app transfers ("Transfer from Venmo", "via Zelle") are always categorized one at a time.

## [0.24.0]

### Added
- One file for several accounts: Settings → Bank sync → Load past history → "One file for several
  accounts" takes a combined CSV with an Account ID (or Institution and Account) column. Each
  account's rows are imported, duplicates skipped, and each part can be undone on its own.
- A paid item can be moved to the month it was really for ("Was for…" → Move). If that month
  already has a payment, the bank charge is tied to it and the extra one removed.

### Changed
- Marking a payment unpaid when it's tied to a bank charge keeps that charge from being used for
  the item again, so it isn't recorded right back.
- "Free after the first half" and "Free after the month" are now "First half remaining" and
  "Second half remaining".

## [0.23.1]

### Changed
- Automatic recording goes by the merchant, not the amount: once a merchant is tied to a bill, its
  charge around the due day is recorded even when the amount changes (utilities), as long as it's
  within the usual range.
- Payments recorded by hand also pair with a charge that names the bill at a different amount.
- Due days that drift are learned too: the middle of the last six posting days when they sit
  within a week, or the latest three when the bill has moved.

## [0.23.0]

### Added
- Payments you recorded by hand are tied to the bank charge that was them (same amount within $1,
  a fitting date, and no other candidate), and the merchant is remembered for the bill. Nothing new
  is recorded. This teaches it bills whose charge doesn't share their name, like a loan paid by
  transfer or insurance billed under the insurer's name.
- Exact matches are recorded on their own: a merchant already tied to the bill, the planned or
  last amount within $1, around the due day. Review lists them under "Done for you" with Undo, the
  month row says "auto", and each line item has a switch to turn it off. Anything less exact still
  waits for your Confirm.
- Due days follow the bank: after three steady months a bill's due day moves to when it actually
  posts. Review shows the change with Keep or Put back; a due day you set yourself stays put.
  Migration `0012`.

### Changed
- Repeating charges in everyday categories (groceries, fuel, dining…) or managed for others are no
  longer suggested as bills.



### Changed
- One set of accounts. Your bank feed's checking, savings and card accounts are now the accounts
  bills are paid from; each appears under Settings → Accounts for bills on its own, with its
  balance updated after every sync. An account you typed by hand is connected to its bank account
  when the match is clear (shared words, the institution's initials, or the same last digits), and
  you can connect or change it there. Connecting one merges the two, moving its bills over.
  Migration `0011`.
- The balance card reads "<account> balance".
- A bill added from a repeating charge is paid from the account it was charged to.

## [0.21.1]

### Fixed
- A charge already recorded by hand (same bill, same amount, entered after the charge or with a
  paid date near it) is no longer offered as the next month's payment.

## [0.21.0]

### Added
- Categories for bank transactions. Each is guessed from the merchant, taken from the bill it was
  confirmed for, or set by you. Setting one asks "This one" or "All from this merchant"; the
  merchant is remembered (as a keyed fingerprint) and its past and future charges follow. Payment
  apps like Venmo and Zelle are set one at a time. Guessed categories reuse yours when the name
  matches (Housing for Home, Restaurants for Dining) and are added only when first needed.
  Migration `0010`.
- Managed for others: mark a category (Settings → Categories) as money you collect and pass on,
  like league fees. It stays out of spending and income and shows its own running balance.
- An Insights page: everyday spending by category against your 3-month average, bills paid, money
  in, what changed, top merchants, money in less money out by month, and the managed balances.
- Transactions can be filtered by category, including uncategorized spending.

### Fixed
- A late bill payment matches the unpaid earlier month first, and the Review form lets you pick
  which month a payment is for.



### Added
- Bills match bank charges. When a charge looks like it paid a bill this month (right direction,
  near the due day, close to the planned amount, and a shared name, an exact amount, or a merchant
  confirmed before), the month row shows "Looks paid". Opening it fills in the bank's amount and
  date; nothing is recorded until you confirm. Confirmed payments stay linked to the charge, and
  the merchant is remembered for next month. Migration `0009`.
- A Review page in the sidebar: bills that look paid, and charges that repeat every month but
  aren't a bill yet, with Add as a monthly bill or Not a bill. Dismissals are remembered.
- The bills balance card says when the amount comes from the bank and when it was updated.



### Changed
- Accounts set themselves up. Each bank-feed account gets a type from its name (checking, savings,
  credit card, loan, mortgage, investment, retirement, crypto), and the type decides how it counts:
  checking and cards are spending, everything counts toward net worth. The Spending / Balance only /
  Hidden choice and the per-account balance link are gone. Migration `0008`.
- The bills balance comes from a bank account chosen once under Settings → Planning. When one
  checking account is clearly the bills account, it is picked automatically.
- Transfers now pair across every account that isn't hidden: card payments with the card, loan and
  mortgage payments with the loan.

### Added
- An Accounts page in the sidebar: net worth, accounts grouped by type, a type to correct if the
  guess is wrong, and Hide for accounts that aren't yours. Empty, inactive accounts fold away.
- Feed names are tidied for display: repeated last digits and internal ids are dropped.

## [0.18.0]

### Added
- Encryption at rest for identifying text: bank account and institution names, merchants,
  descriptions, memos and imported file names, plus notes and payment links. Each value is sealed
  with AES-256-GCM under `BANK_SYNC_KEY` before it is stored. Values already in the database are
  sealed at the next start. Settings → About shows whether encryption is on.

### Changed
- `BANK_SYNC_KEY` now also protects your data. Keep a copy: without it, encrypted fields can't be
  read back.
- The first bank sync asks for 89 days, so the bridge no longer warns that the range was capped.

## [0.17.1]

### Added
- Export bank-feed data as CSV from Settings → Bank sync: every transaction (with its cleaned
  merchant, transfer flag and account) and every account (with its balance and choice).

## [0.17.0]

### Added
- Bank sync, optional and read-only, through a SimpleFIN bridge. Settings → Bank sync: paste a setup
  token, and every account the bridge sends is listed with its balance and transaction count. Mark
  each one Spending, Balance only or Hidden, and let a bank account keep a Budget account's balance
  current, such as the bills account.
- A daily sync (after 6 AM by default) plus Sync now. The bridge's own warnings, such as a login
  that needs attention, are shown.
- Merchant names cleaned of card-processor prefixes, store numbers and order ids, so one store is
  one name.
- Transfers between your own accounts are matched and set aside, and account-verification cents
  are ignored.
- Load past history from a bank's CSV export, any common layout. Rows already present are skipped,
  and a file can be undone.
- Transactions page (from Settings → Bank sync), read-only for now.
- `BANK_SYNC_KEY` turns it on and encrypts the access link. Migration `0007`.

## [0.16.0]

### Changed
- The web now looks like the phone app: Figtree type, Phosphor icons, cool grays and one accent.
  Settings → Appearance offers the phone's six accents (Cobalt by default) in place of Cool and
  Warm, plus light, dark or match device. A browser that chose Cool or Warm starts on Cobalt.

## [0.15.1]

### Changed
- New icon to match the phone app: the Ledger mark in Cobalt, for the browser tab, home-screen
  install, the sidebar and the Unraid template.

## [0.15.0] — unreleased

### Added

- Ready for the phone app's offline mode: a payment entered without a connection is sent later,
  applied once even if sent twice, and refused if it was changed elsewhere in the meantime.
- Migration `0006`.

## [0.14.1] — unreleased

### Fixed

- Signing in could land on "page could not be found": a background request from the browser (the
  tab icon) was remembered as the page to return to. Only real pages are remembered now.

## [0.14.0] — unreleased

### Added

- Phones: add one from Settings → Sign-in & people with a one-time code or QR plus your password.
- Each phone is listed with when it was last used, and can be signed out on its own.
- The API can record and clear payments and set the bills balance, for the phone app.

### Security

- The API accepts device tokens only, never the browser's sign-in. Tokens are stored as hashes,
  expire after a year, and can be refreshed or revoked.
- Changing your password or signing out everywhere also signs out every phone.
- The build fails if any API route skips the token check.
- Migration `0005`.

## [0.13.0] — unreleased

### Added

- Sign-in. The first visit creates your account using a setup code from the container's log.
- Up to two people. Add the second from Settings → Sign-in & people with a one-time code.
- Change password, sign out everywhere, and remove the other account.
- Forgotten password: `node scripts/reset-password.mjs <username>` inside the container.
- Each payment records who entered it.

### Security

- Every page, action and API call requires sign-in; sign-in attempts are rate limited.
- The build fails if any server action skips the sign-in check.
- Migration `0004`.

## [0.12.0] — unreleased

### Security

- Payment links accept only `http://` and `https://` addresses. Anything else is refused when saved,
  dropped on import, and never shown as a link.
- Strict Content-Security-Policy on every page, plus `nosniff`, referrer and framing headers.
- Request size limits: 5 MB for import, 256 KB for other API calls.
- Unused image-optimizer endpoint turned off.
- `/api/health` reports status only; the version moved to `/api/v1/meta`.

### Changed

- The importer runs through the app itself instead of calling the API from the browser.
- Every dependency pinned to an exact version; database connections time out instead of hanging.
- `npm run preflight` type-checks against the real database client without Docker.

## [0.11.2] — unreleased

### Security

- Test tools: Vitest 3 → 5 with Vite 8. Clears the last advisories; `npm audit` is now clean,
  dev included. Nothing in the image changes.

## [0.11.1] — unreleased

### Security

- Next.js 16.3.6 → 16.4.6, clearing a critical advisory.
- Prisma 7.10.0 → 7.10.1 (client, adapter and the CLI in the image), clearing high advisories in its
  bundled dependencies.
- No feature changes.

## [0.11.0] — unreleased

### Changed

- New look: sidebar navigation, new fonts and colours, cards across the top of the month.
- Month view: All / Unpaid / Paid filter, progress per half, status on every bill, and a
  "Next 45 days" and "Coming up" panel.
- Recording a payment always takes a confirmation: click the amount, check it and the date,
  press Confirm. The paid date is now saved.
- What can I pay? has a slider for a payment today, a chart and a day-by-day list.
- Line items open in a side panel, with a month grid for how often.
- Setup and Import are now one Settings area. Old links redirect.

### Added

- ⌘K / Ctrl+K: type an item and amount, Enter to review, Enter to record.
- Year & reports: every item by month, monthly and category totals, change on last year,
  CSV download.
- Appearance setting: cool or warm theme, light, dark or match device.

## [0.10.0] — unreleased

### Added

- **"Paid from what's left over"** on a line item. For a card whose payment is
  decided by whatever remains once the bills are covered, rather than fixed in
  advance.

  A flagged item leaves its half, stops counting toward either remaining figure,
  and both transfer figures rise by its amount — so "free after both halves"
  becomes genuinely what is available to send it. It also drops out of the
  projection's obligations, which turns "safe to pay today" into the amount that
  can go to that card rather than a figure that already assumed it was paid.

  It is tracked in full: actuals, month adjustments and history are unaffected,
  and it appears as its own card on the right of the month view, titled by the
  item, showing its due day and whether the surplus covers the planned payment.

  Off by default, so existing installations are unchanged. Migration `0003`.
- 3 more tests covering the figures with and without the flag.

## [0.9.3] — unreleased

### Fixed

- **The bills balance now carries into later months.** It is recorded per month,
  so a new month found nothing and both transfer figures sat empty until a
  balance was typed again. The most recent balance at or before the month being
  viewed is used instead, and the field says which month it came from so a
  carried figure is never mistaken for a fresh one.

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
