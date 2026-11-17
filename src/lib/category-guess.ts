/**
 * A first guess at a transaction's category from the merchant and description.
 * Only national chains and plain words: the rules describe how merchants name
 * themselves, not anyone's own spending. A guess is replaced by a category the
 * person sets, a merchant rule they taught, or the bill a payment was
 * confirmed for.
 */

export interface GuessCategory {
  /** The name created when no existing category matches. */
  name: string;
  /** Existing category names that mean the same thing, compared case-insensitively. */
  aliases: string[];
}

/** Word-edge pattern: matches whole words and phrases, tolerant of punctuation. */
const w = (...words: string[]) => new RegExp(`(?:^|[^a-z0-9])(?:${words.join("|")})(?:$|[^a-z0-9])`);

const FUEL: GuessCategory = { name: "Fuel", aliases: ["Gas", "Gasoline"] };

const RULES: Array<{ category: GuessCategory; pattern: RegExp; moneyIn?: boolean }> = [
  { category: { name: "Paycheck", aliases: ["Income", "Salary", "Pay"] }, pattern: w("payroll", "direct dep", "dir dep", "salary", "paycheck"), moneyIn: true },
  { category: { name: "Fees", aliases: ["Bank fees"] }, pattern: w("interest charge", "finance charge", "overdraft", "late fee", "late charge", "annual fee", "foreign transaction fee", "service fee") },
  { category: { name: "Cash", aliases: ["ATM"] }, pattern: w("atm", "cash withdrawal") },
  { category: { name: "Subscriptions", aliases: ["Streaming", "Subscription"] }, pattern: w("netflix", "spotify", "hulu", "disney plus", "disneyplus", "youtube", "apple com bill", "apple\\.com/bill", "icloud", "google one", "google storage", "prime video", "paramount", "peacock", "audible", "patreon", "sirius", "openai", "chatgpt", "anthropic", "microsoft", "msft", "adobe", "dropbox") },
  // Fuel at a warehouse club or big-box store is fuel, not a shopping trip.
  { category: FUEL, pattern: w("costco gas", "costco fuel", "sams club fuel", "sam s club fuel", "sams fuel", "walmart fuel", "murphy express") },
  // Big-box and warehouse trips mix groceries and everything else, so they get their own categories.
  { category: { name: "Target & Walmart", aliases: ["Big box", "Target and Walmart"] }, pattern: w("target", "target com", "walmart", "wal mart", "walmart com", "wm supercenter", "walmart supercenter") },
  { category: { name: "Costco & Sam's Club", aliases: ["Warehouse club", "Warehouse clubs", "Costco and Sams Club", "Costco & Sams Club"] }, pattern: w("costco", "costco whse", "costco wholesale", "sams club", "sam s club", "samsclub") },
  { category: { name: "Groceries", aliases: ["Grocery", "Food"] }, pattern: w("grocery", "groceries", "supermarket", "kroger", "aldi", "whole foods", "meijer", "hy vee", "giant eagle", "stop shop", "shoprite", "harris teeter", "winn dixie", "ingles", "fred meyer", "ralphs", "vons", "jewel osco", "king soopers", "piggly wiggly", "hannaford", "price chopper", "schnucks", "save mart", "stater bros", "winco", "tom thumb", "heb", "h e b", "natural grocers", "food 4 less", "food4less", "trader joe s?", "safeway", "publix", "albertsons", "food lion", "wegmans", "sprouts") },
  { category: { name: "Dining", aliases: ["Restaurants", "Eating out", "Dining out"] }, pattern: w("restaurant", "cafe", "coffee", "starbucks", "dunkin", "mcdonald s?", "chick fil a", "taco bell", "wendy s?", "burger", "pizza", "grill", "diner", "bakery", "donuts?", "bbq", "sushi", "doordash", "uber eats", "grubhub", "chipotle", "panera", "domino s?", "popeyes", "kfc", "arby s?", "sonic drive") },
  { category: FUEL, pattern: w("fuel", "gas station", "shell", "exxon", "exxonmobil", "mobil", "chevron", "valero", "texaco", "phillips 66", "circle k", "7 eleven", "murphy usa", "sunoco", "speedway", "citgo", "conoco", "sinclair", "marathon petro") },
  { category: { name: "Auto", aliases: ["Car", "Vehicle", "Transportation"] }, pattern: w("auto parts", "autozone", "o reilly", "oreilly", "advance auto", "jiffy lube", "car wash", "tires?", "toll", "tollway", "parking", "dmv") },
  { category: { name: "Home", aliases: ["Housing", "Home improvement"] }, pattern: w("home depot", "lowe s", "lowes", "ikea", "wayfair", "hardware", "hoa", "homeowners") },
  { category: { name: "Utilities", aliases: ["Utility", "Bills"] }, pattern: w("electric", "energy", "water", "utility", "utilities", "internet", "wireless", "verizon", "at t", "t mobile", "comcast", "xfinity", "spectrum", "sewer", "trash", "waste") },
  { category: { name: "Insurance", aliases: [] }, pattern: w("insurance", "geico", "progressive", "state farm", "allstate", "liberty mutual", "nationwide") },
  { category: { name: "Medical", aliases: ["Health", "Healthcare", "Medical & health"] }, pattern: w("pharmacy", "cvs", "walgreens", "medical", "clinic", "hospital", "dental", "dentist", "dds", "dmd", "orthodont\\w*", "optometr\\w*", "urgent care", "labcorp", "quest diagnostics", "physicians?", "pediatrics?", "pediatric \\w+", "myeyedr", "eye care", "eyecare", "vision", "optical", "dermatology", "chiropractic", "physical therapy", "family medicine", "health center", "imaging", "radiology", "orthopedics?") },
  { category: { name: "Pets", aliases: ["Pet"] }, pattern: w("pets?", "petco", "petsmart", "chewy", "vet", "veterinary", "animal hospital") },
  { category: { name: "Travel", aliases: ["Vacation"] }, pattern: w("airlines?", "delta air", "united air", "american air", "southwest", "hotel", "marriott", "hilton", "hyatt", "airbnb", "vrbo", "expedia", "uber", "lyft", "hertz", "avis", "enterprise rent") },
  { category: { name: "Entertainment", aliases: ["Fun", "Recreation"] }, pattern: w("cinema", "theater", "theatre", "movies?", "amc", "regal", "ticketmaster", "stubhub", "steam", "playstation", "xbox", "nintendo", "bowling") },
  { category: { name: "Personal care", aliases: ["Personal"] }, pattern: w("salon", "barber", "spa", "nails?", "great clips", "supercuts", "ulta", "sephora") },
  { category: { name: "Giving", aliases: ["Church", "Tithe", "Donations", "Charity"] }, pattern: w("church", "ministry", "ministries", "tithe", "tithely", "pushpay", "donation", "charity", "chapel", "baptist", "methodist", "fellowship", "parish", "catholic", "lutheran", "presbyterian") },
  // Church names often run together ("Hillcrestbible"), so these match anywhere in the name.
  { category: { name: "Giving", aliases: ["Church", "Tithe", "Donations", "Charity"] }, pattern: /bible|church/ },
  { category: { name: "Education", aliases: ["School"] }, pattern: w("school", "tuition", "college", "university") },
  { category: { name: "Shopping", aliases: ["Household", "General"] }, pattern: w("amazon", "amzn", "best buy", "ebay", "etsy", "kohl s?", "macy s?", "tj maxx", "marshalls", "old navy", "dollar tree", "dollar general") },
];

/** Payment apps carry many unrelated payments under one name, so no merchant-wide rule is learned for them. */
const PEER = /^(?:transfer (?:to|from|via) )?(venmo|zelle|paypal|cash app|square cash|apple cash)\b/i;

export function isPeerPayment(merchant: string): boolean {
  return PEER.test(merchant.trim());
}

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/['’]/g, " ").replace(/[^a-z0-9./]+/g, " ")} `;
}

/** The guessed category for a transaction, or null when nothing fits. Money in only guesses pay. */
export function guessCategory(merchant: string, description: string, amountCents: number): GuessCategory | null {
  if (isPeerPayment(merchant)) return null;
  const text = normalize(`${merchant} ${description}`);
  for (const rule of RULES) {
    if (amountCents > 0 && !rule.moneyIn) continue;
    if (amountCents < 0 && rule.moneyIn) continue;
    if (rule.pattern.test(text)) return rule.category;
  }
  return null;
}

/** Card refunds take the merchant's spending category; money into checking only guesses pay. */
export function guessFor(merchant: string, description: string, amountCents: number, onCard: boolean): GuessCategory | null {
  return guessCategory(merchant, description, onCard && amountCents > 0 ? -amountCents : amountCents);
}

/** Category names whose money in is income rather than a refund. */
export const INCOME_NAMES = new Set(["paycheck", "income", "salary", "pay", "interest", "dividends"]);

export function isIncomeCategory(name: string | null | undefined): boolean {
  return !!name && INCOME_NAMES.has(name.trim().toLowerCase());
}

/** Day-to-day spending that repeats without being a bill (groceries, fuel…), by category name or alias. */
const EVERYDAY = new Set(
  RULES.filter((r) => ["Groceries", "Target & Walmart", "Costco & Sam's Club", "Dining", "Fuel", "Shopping", "Personal care", "Entertainment", "Travel", "Cash", "Fees", "Auto"].includes(r.category.name))
    .flatMap((r) => [r.category.name, ...r.category.aliases])
    .map((n) => n.toLowerCase()),
);

export function isEverydayCategory(name: string | null | undefined): boolean {
  return !!name && EVERYDAY.has(name.trim().toLowerCase());
}
