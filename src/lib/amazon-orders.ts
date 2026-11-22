/**
 * Amazon order history (the "Order History.csv" in Amazon's "Request your
 * data" download): its items grouped into the shipments a card is charged for,
 * each item sorted into a kind of spending, and shipments matched to card
 * charges. Pure: the server loads the charges and writes the splits.
 *
 * Amazon charges a card per shipment, near its ship date, for the items' totals
 * (tax and shipping included, discounts taken off). A shipment is matched to a
 * charge of the same amount within a few days; when none fits, the whole order
 * is tried, since small orders are often charged at once.
 */

import { splitCsv } from "./bank-csv";

export type ItemKind =
  | "groceries" | "household" | "health" | "personal" | "clothing" | "electronics" | "outdoors"
  | "toys" | "aquarium" | "repair" | "home" | "school" | "pets" | "auto" | "sports" | "gifts" | "other";

export interface Kind {
  kind: ItemKind;
  /** The category made when none matches. */
  name: string;
  /** An existing category this kind goes to, by name. */
  matches: RegExp;
}

/** Earlier kinds win when an item's name fits several. */
export const KINDS: Kind[] = [
  { kind: "pets", name: "Pets", matches: /^pets?$|pet supplies/i },
  { kind: "aquarium", name: "Aquarium", matches: /aquarium|fish/i },
  { kind: "sports", name: "Sports", matches: /hockey|sports? fees|^sports$/i },
  { kind: "electronics", name: "Electronics", matches: /electronic/i },
  { kind: "household", name: "Household", matches: /household/i },
  { kind: "repair", name: "Home repair", matches: /home repair|home upkeep|maintenance/i },
  { kind: "health", name: "Medical", matches: /medical|health|pharmacy/i },
  { kind: "personal", name: "Personal care", matches: /personal care|beauty|toiletr/i },
  { kind: "school", name: "School", matches: /school|education|homeschool/i },
  { kind: "outdoors", name: "Outdoors & sports", matches: /outdoor/i },
  { kind: "toys", name: "Toys & games", matches: /toys?|games?|hobb/i },
  { kind: "home", name: "Home", matches: /^home$|home goods|decor|furnish/i },
  { kind: "gifts", name: "Gifts & occasions", matches: /gift/i },
  { kind: "auto", name: "Auto", matches: /^auto|vehicle|car care/i },
  { kind: "clothing", name: "Clothing", matches: /cloth|apparel/i },
  { kind: "groceries", name: "Groceries", matches: /grocer|food at home/i },
];

const w = (...words: string[]) => new RegExp(`(?:^|[^a-z0-9])(?:${words.join("|")})(?:$|[^a-z0-9])`, "i");

/** Item name patterns, checked in this order. Generic product words only. */
const BY_NAME: Array<[ItemKind, RegExp]> = [
  ["pets", w("dog food", "cat food", "dog treats?", "cat litter", "pet", "dog", "cat", "puppy", "kitten")],
  ["aquarium", w("aquarium", "fish tank", "fish food", "aquatic", "shrimp", "algae", "water conditioner", "fish feeder", "air pump", "aerator")],
  ["sports", w("hockey", "skate", "skates", "shin guards?", "stick tape", "lacrosse", "baseball glove", "soccer ball", "basketball", "football")],
  ["electronics", w("smartphone", "phone", "phone case", "screen protector", "charger", "charging", "power bank", "usb", "usb-c", "hdmi", "cable", "headphones?", "earbuds?", "speaker", "smart plug", "tablet", "laptop", "keyboard", "mouse", "monitor", "sd card", "hard drive", "ssd", "router", "gimbal", "camera", "webcam")],
  ["household", w("toilet paper", "bath tissue", "paper towels?", "trash bags?", "garbage bags?", "compactor bags?", "detergent", "dishwasher pods?", "dish soap", "laundry", "cleaner", "cleaning", "wipes", "tissues?", "napkins?", "sponges?", "storage bags", "aluminum foil", "plastic wrap", "batteries", "battery", "light bulbs?", "led bulbs?", "hand soap", "air filter", "water filter", "duster", "drain protector")],
  ["repair", w("replacement part", "oem", "heating element", "pump", "motor assembly", "fill valve", "flush handle", "toilet seat", "hose clamp", "coil cleaner", "power cord", "repair", "faucet", "plumbing", "hinge", "weatherstrip", "screws", "drill bit", "socket", "tool", "tape")],
  ["health", w("vitamins?", "multivitamin", "supplements?", "probiotic", "fish oil", "omega", "magnesium", "zinc", "elderberry", "melatonin", "acne", "pain relief", "ibuprofen", "acetaminophen", "allergy", "cough", "cold medicine", "thermometer", "bandages?", "first aid", "skin closures", "eye drops", "contact lens", "insoles", "brace", "creatine", "protein powder", "electrolytes?")],
  ["personal", w("shampoo", "conditioner", "body wash", "soap", "deodorant", "toothpaste", "toothbrush", "floss", "razor", "shaver", "trimmer", "lotion", "sunscreen", "lip balm", "cleanser", "moisturizer", "skincare", "makeup", "concealer", "foundation", "mascara", "eyeliner", "lipstick", "cosmetic", "curling iron", "hair dryer", "straightener", "perfume", "nail")],
  ["school", w("notebooks?", "pens?", "pencils?", "markers?", "crayons?", "highlighters?", "binder", "printer paper", "copy paper", "composition", "textbook", "workbook", "curriculum", "calculator", "glue sticks?", "index cards?", "flash cards?", "school supplies")],
  ["outdoors", w("backpack", "backpacking", "camping", "tent", "sleeping bag", "sleeping pad", "hiking", "trekking", "golf", "fishing", "kayak", "freeze dried", "headlamp", "water bottle", "hydration", "cooler")],
  ["toys", w("lego", "toy", "toys", "puzzle", "board game", "card game", "costume", "figurine", "collectible", "playset", "doll", "action figure", "party supplies", "decorations", "balloons")],
  ["home", w("rug", "ottoman", "comforter", "sheets", "bedding", "pillow", "curtains?", "lamp", "decor", "candle", "frame", "organizer", "shelf", "mug", "cookware", "utensils?", "kitchen", "towels?", "blanket", "furniture", "mattress")],
  ["gifts", w("gift card", "egift", "gift certificate", "greeting cards?", "thank you cards?", "gift wrap", "gift bags?")],
  ["auto", w("car", "automotive", "motor oil", "wiper", "tire", "truck")],
  ["clothing", w("shirt", "t-shirt", "pants", "jeans", "shorts", "dress", "skirt", "jacket", "coat", "hoodie", "sweater", "socks", "underwear", "shoes", "sneakers", "boots", "sandals", "hat", "cap", "gloves", "scarf", "belt", "leggings", "pajamas", "swimsuit", "tie")],
  // Food last, so "water filter", "dog food" and "fish oil" are caught above.
  ["groceries", w("produce", "fruit", "organic", "vegetables?", "potato(es)?", "sweet potatoes", "onions?", "garlic", "cucumbers?", "brussels sprouts", "broccoli", "carrots?", "lettuce", "spinach", "salad", "tomato(es)?", "peppers?", "avocados?", "apples?", "bananas?", "berries", "strawberries", "blueberries", "grapes", "lemons?", "limes?", "oranges?", "milk", "cheese", "yogurt", "butter", "eggs", "bread", "bagels?", "tortillas?", "pasta", "rice", "beans", "flour", "sugar", "cereal", "oatmeal", "oats", "granola", "snacks?", "chips", "crackers", "cookies", "candy", "chocolate", "marshmallows?", "gummies", "popcorn", "pretzels", "nuts", "almonds", "peanut butter", "jelly", "jam", "honey", "syrup", "sauce", "salsa", "ketchup", "mustard", "mayo", "dressing", "spices?", "seasoning", "salt", "olive oil", "cooking oil", "broth", "soup", "coffee", "k-cups?", "tea", "juice", "soda", "sparkling water", "drink mix", "chicken", "beef", "pork", "turkey", "bacon", "sausage", "ham", "salmon", "tuna", "ice cream", "grocery", "whole foods", "365 by")],
];

/** Amazon's own department, used when the name says nothing. */
const BY_DEPARTMENT: Record<string, ItemKind> = {
  grocery: "groceries", apparel: "clothing", shoes: "clothing", "health and beauty": "health",
  paperback: "school", hardcover: "school", "perfect paperback": "school", pamphlet: "school", "thread bound": "school", map: "school",
  automotive: "auto", "lawn & patio": "repair", "tools & home improvement": "repair", "tools & hardware": "repair",
  "ecard gift certificate": "gifts", "paper gift certificate": "gifts", "software download": "electronics", electronics: "electronics",
  toy: "toys", kitchen: "home", sports: "outdoors", "office product": "school", "pet products": "pets",
};

/**
 * Amazon's own category path for a product ("Grocery & Gourmet Food › Produce"), as the kind of
 * spending it is. Null when the path says nothing we know.
 */
export function kindFromCategory(path: string | null | undefined): ItemKind | null {
  if (!path) return null;
  const parts = path.split(/\s*[›>|/]\s*/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const top = parts[0] ?? "";
  const all = parts.join(" > ");
  if (/^grocery|gourmet food/.test(top)) return /pet food|dog food|cat food/.test(all) ? "pets" : "groceries";
  if (/^pet supplies/.test(top)) return /fish|aquarium/.test(all) ? "aquarium" : "pets";
  if (/^health & household|^health and household/.test(top))
    return /vitamin|supplement|medic|first aid|health care|wellness|sexual|diet|sports nutrition/.test(all) ? "health" : "household";
  if (/^beauty|personal care/.test(top)) return "personal";
  if (/^clothing|shoes|jewelry|fashion/.test(top)) return "clothing";
  if (/^toys|^games/.test(top)) return "toys";
  if (/^electronics|^cell phones|^computers|^video games|^camera/.test(top)) return "electronics";
  if (/^home & kitchen|^home and kitchen|^kitchen/.test(top)) return /cleaning|laundry|storage bag|trash|paper towel/.test(all) ? "household" : "home";
  if (/^tools|home improvement|^appliances|^patio|^lawn|^garden/.test(top)) return "repair";
  if (/^automotive/.test(top)) return "auto";
  if (/^sports & outdoors|^sports and outdoors/.test(top)) return /hockey|team sports|skating/.test(all) ? "sports" : "outdoors";
  if (/^office products|^books|^kindle|^arts, crafts|^arts & crafts/.test(top)) return "school";
  if (/^gift cards/.test(top)) return "gifts";
  if (/^baby/.test(top)) return /diaper|wipes/.test(all) ? "household" : "home";
  return null;
}

/** What kind of spending an item is, from its name and Amazon's department. */
export function itemKind(name: string, department = ""): ItemKind {
  const dept = department.trim().toLowerCase();
  // Food stays food unless the name plainly says otherwise (dog food, paper towels).
  if (dept === "grocery") {
    for (const [kind, rx] of BY_NAME.slice(0, 6)) if (rx.test(name)) return kind;
    return "groceries";
  }
  for (const [kind, rx] of BY_NAME) if (rx.test(name)) return kind;
  return BY_DEPARTMENT[dept] ?? (/whole foods|grocery|365 by/i.test(name) ? "groceries" : "other");
}

export interface OrderItem {
  orderId: string;
  /** YYYY-MM-DD */
  orderDate: string;
  shipDate: string | null;
  /** Groups items charged together: the order and its tracking number, or ship date. */
  shipmentKey: string;
  name: string;
  department: string;
  cents: number;
  kind: ItemKind;
  /** Amazon's product id (ASIN), when the extension sends it. */
  productId?: string | null;
}

export interface Shipment {
  key: string;
  orderId: string;
  /** When the charge should land. YYYY-MM-DD */
  date: string;
  cents: number;
  items: OrderItem[];
}

const money = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = Number(raw.replace(/['",$\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const day = (raw: string | undefined): string | null => (raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null);

const KEEP = ["order id", "order date", "ship date", "order status", "department", "product name", "total amount", "carrier name & tracking number"];

/**
 * The file with only the columns the import reads, so it stays small to send:
 * the rest (addresses, payment details, gift messages) never leaves the browser.
 */
export function slimOrderHistory(text: string): string {
  const rows = splitCsv(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return "";
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = KEEP.map((k) => header.indexOf(k));
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows
    .filter((r, i) => i === 0 || r.some((v) => v))
    .map((r, i) => idx.map((j, n) => (j < 0 ? (i === 0 ? KEEP[n] : "") : q(i === 0 ? KEEP[n] : (r[j] ?? "")))).join(","))
    .join("\n");
}

/** Reads the order history; cancelled items and items with no amount are left out. */
export function parseOrderHistory(text: string): OrderItem[] {
  const rows = splitCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const need = ["order id", "order date", "product name", "total amount"];
  if (need.some((n) => col(n) < 0)) throw new Error("This doesn't look like Amazon's Order History.csv");
  const [iOrder, iDate, iName, iTotal] = need.map(col);
  const [iShip, iDept, iStatus, iTrack, iAsin] = ["ship date", "department", "order status", "carrier name & tracking number", "asin"].map(col);
  const out: OrderItem[] = [];
  for (const r of rows.slice(1)) {
    if (!r[iOrder]) continue;
    if (iStatus >= 0 && /cancel/i.test(r[iStatus] ?? "")) continue;
    const cents = money(r[iTotal]);
    const orderDate = day(r[iDate]);
    if (cents === null || cents <= 0 || !orderDate) continue;
    const shipDate = iShip >= 0 ? day(r[iShip]) : null;
    const tracking = iTrack >= 0 && r[iTrack] && !/not available/i.test(r[iTrack]) ? r[iTrack] : null;
    const name = r[iName] ?? "";
    const department = iDept >= 0 ? (r[iDept] ?? "") : "";
    out.push({
      orderId: r[iOrder],
      orderDate,
      shipDate,
      shipmentKey: `${r[iOrder]}|${tracking ?? shipDate ?? orderDate}`,
      name,
      department,
      cents,
      kind: itemKind(name, department),
      productId: iAsin >= 0 && /^[A-Z0-9]{10}$/.test((r[iAsin] ?? "").trim()) ? r[iAsin].trim() : null,
    });
  }
  return out;
}

export function shipments(items: OrderItem[]): Shipment[] {
  const map = new Map<string, Shipment>();
  for (const it of items) {
    const s = map.get(it.shipmentKey) ?? { key: it.shipmentKey, orderId: it.orderId, date: it.shipDate ?? it.orderDate, cents: 0, items: [] };
    s.cents += it.cents;
    s.items.push(it);
    if (it.shipDate && it.shipDate < s.date) s.date = it.shipDate;
    map.set(it.shipmentKey, s);
  }
  return [...map.values()];
}

export interface Charge {
  id: string;
  /** YYYY-MM-DD */
  postedOn: string;
  /** Positive: the amount charged. */
  cents: number;
}

export interface Match {
  chargeId: string;
  items: OrderItem[];
}

const DAY = 86_400_000;
const gap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/**
 * Pairs shipments (then whole orders) with charges of the same amount, each
 * charge used once, closest date first. A cent either way is allowed for rounding.
 */
export function matchCharges(all: Shipment[], charges: Charge[], windowDays = 5): Match[] {
  const used = new Set<string>();
  const out: Match[] = [];
  const take = (cents: number, date: string, from: string, items: OrderItem[]) => {
    const hit = charges
      .filter((c) => !used.has(c.id) && Math.abs(c.cents - cents) <= 1 && c.postedOn >= from && gap(c.postedOn, date) <= windowDays + 2)
      .sort((a, b) => gap(a.postedOn, date) - gap(b.postedOn, date))[0];
    if (!hit) return false;
    used.add(hit.id);
    out.push({ chargeId: hit.id, items });
    return true;
  };
  const done = new Set<string>();
  for (const s of [...all].sort((a, b) => b.cents - a.cents)) {
    const orderDate = s.items[0].orderDate;
    if (take(s.cents, s.date, shiftDay(orderDate, -1), s.items)) done.add(s.key);
  }
  // Whole orders whose shipments didn't match one by one.
  const orders = new Map<string, Shipment[]>();
  for (const s of all) if (!done.has(s.key)) orders.set(s.orderId, [...(orders.get(s.orderId) ?? []), s]);
  for (const list of orders.values()) {
    if (list.length < 2) continue;
    const items = list.flatMap((s) => s.items);
    const date = list.map((s) => s.date).sort()[0];
    take(list.reduce((t, s) => t + s.cents, 0), date, shiftDay(items[0].orderDate, -1), items);
  }
  return out;
}

function shiftDay(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/**
 * A charge's amount shared by kind, in proportion to the items' totals, so the
 * parts add up to the charge exactly. Notes list the item names.
 */
/** Shares [chargeCents] across [items] by price, one part per item; the parts add up exactly. */
export function splitByItem(chargeCents: number, items: OrderItem[]): Array<{ item: OrderItem; cents: number }> {
  const total = items.reduce((s, it) => s + it.cents, 0);
  const parts = items.map((item) => ({ item, cents: total > 0 ? Math.round((chargeCents * item.cents) / total) : Math.round(chargeCents / items.length) }));
  const diff = chargeCents - parts.reduce((s, p) => s + p.cents, 0);
  if (parts.length) [...parts].sort((a, b) => b.cents - a.cents)[0].cents += diff;
  return parts;
}

export function splitByKind(chargeCents: number, items: OrderItem[]): Array<{ kind: ItemKind; cents: number; names: string[] }> {
  const byKind = new Map<ItemKind, { cents: number; names: string[] }>();
  for (const it of items) {
    const k = byKind.get(it.kind) ?? { cents: 0, names: [] };
    k.cents += it.cents;
    k.names.push(it.name);
    byKind.set(it.kind, k);
  }
  const total = items.reduce((s, it) => s + it.cents, 0);
  const parts = [...byKind.entries()].map(([kind, v]) => ({ kind, cents: total > 0 ? Math.round((chargeCents * v.cents) / total) : 0, names: v.names }));
  const diff = chargeCents - parts.reduce((s, p) => s + p.cents, 0);
  if (parts.length) parts.sort((a, b) => b.cents - a.cents)[0].cents += diff;
  return parts;
}
