# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org):
the minor number moves when features land, the patch number for fixes.

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
  Kohl's, Clothing, Outdoors & sports, Fitness, Alcohol, Gifts & occasions, Aquarium and Crypto.
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
