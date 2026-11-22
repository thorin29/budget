/**
 * Orders sent by the Amazon browser extension, matched to bank charges. Pure:
 * the server loads the charges and writes the splits (src/server/amazon-sync.ts).
 *
 * The extension reads each order's own charge list ("Transactions" on the
 * order page), so a charge is matched by its exact amount (a cent either way)
 * within five days, then shared across the items of the shipment it paid for.
 * An order without a charge list falls back to matchCharges, as the CSV does.
 *
 * Only what's needed crosses the wire: item names, product ids, Amazon's
 * category, prices, quantities, ship dates, and each charge's date, amount and
 * card's last 4. Nothing else from Amazon is accepted or kept.
 */

import { itemKind, kindFromCategory, matchCharges, shipments, type OrderItem } from "./amazon-orders";

export interface SyncItem {
  name: string;
  /** One unit's price, before tax and shipping. */
  cents: number;
  quantity: number;
  shipmentKey: string;
  shipDate: string | null;
  /** Amazon's product id (ASIN). */
  productId?: string | null;
  /** Amazon's category path, "Grocery & Gourmet Food › Produce". */
  category?: string | null;
}

export interface SyncCharge {
  date: string;
  cents: number;
  last4: string | null;
}

export interface SyncOrder {
  orderId: string;
  orderDate: string;
  items: SyncItem[];
  charges: SyncCharge[];
}

export interface BankCharge {
  id: string;
  /** YYYY-MM-DD */
  postedOn: string;
  /** Positive: the amount charged. */
  cents: number;
  /** The card's last 4 when its name shows them. */
  last4: string | null;
  /** Already split (by the CSV or an earlier sync): matched, never written again. */
  split: boolean;
}

export interface SyncMatch {
  chargeId: string;
  cents: number;
  items: OrderItem[];
}

export interface SyncPlan {
  /** Charges to split now. */
  toSplit: SyncMatch[];
  /** Charges found, including ones already split. */
  matched: number;
  /** Orders with a charge whose bank charge hasn't arrived. */
  waiting: string[];
  /** The oldest waiting order's date, so the extension starts there next time. */
  waitingSince: string | null;
  /** Orders with a charge list whose charge was never found (too old to wait for). */
  noMatch: number;
  /** Orders without a charge list that item totals couldn't match either. */
  noChargeList: number;
  /**
   * Positions (in the orders sent) of orders that are finished: every charge found, split now or
   * before. The extension skips their pages next time. Positions only, never order numbers.
   */
  done: number[];
}

export const LIMITS = {
  orders: 50,
  items: 100,
  charges: 20,
  name: 300,
  key: 120,
  orderId: 40,
  category: 200,
  cents: 10_000_000,
  quantity: 999,
} as const;

/** Charges still missing after this many days are another card or a gift card, not waiting. */
export const WAIT_DAYS = 21;
const WINDOW_DAYS = 5;
const DAY = 86_400_000;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isCents = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= LIMITS.cents;
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t && t.length <= max ? t : null;
};

/**
 * Checks the body field by field. Returns the orders or the issues found; unknown fields are
 * dropped rather than kept, so nothing extra from Amazon reaches the database.
 */
export function readOrders(body: unknown): { orders: SyncOrder[] } | { issues: Record<string, string[]> } {
  const list = (body as { orders?: unknown } | null)?.orders;
  if (!Array.isArray(list) || !list.length) return { issues: { orders: ["Send at least one order"] } };
  if (list.length > LIMITS.orders) return { issues: { orders: [`At most ${LIMITS.orders} orders at a time`] } };
  const orders: SyncOrder[] = [];
  const issues: Record<string, string[]> = {};
  list.forEach((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const at = `orders.${i}`;
    const orderId = text(o.orderId, LIMITS.orderId);
    if (!orderId) return void (issues[`${at}.orderId`] = ["Required"]);
    if (!isDay(o.orderDate)) return void (issues[`${at}.orderDate`] = ["Use YYYY-MM-DD"]);
    if (!Array.isArray(o.items) || !o.items.length || o.items.length > LIMITS.items) return void (issues[`${at}.items`] = [`1 to ${LIMITS.items} items`]);
    const charges = Array.isArray(o.charges) ? o.charges : [];
    if (charges.length > LIMITS.charges) return void (issues[`${at}.charges`] = [`At most ${LIMITS.charges}`]);
    const items: SyncItem[] = [];
    for (const [j, r] of (o.items as unknown[]).entries()) {
      const it = (r ?? {}) as Record<string, unknown>;
      const name = text(it.name, LIMITS.name);
      const key = text(it.shipmentKey, LIMITS.key) ?? "1";
      const quantity = it.quantity === undefined ? 1 : it.quantity;
      if (!name || !isCents(it.cents) || !Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > LIMITS.quantity) {
        issues[`${at}.items.${j}`] = ["Needs name, cents and quantity"];
        return;
      }
      const shipDate = it.shipDate == null ? null : isDay(it.shipDate) ? it.shipDate : undefined;
      if (shipDate === undefined) return void (issues[`${at}.items.${j}.shipDate`] = ["Use YYYY-MM-DD"]);
      // Optional extras: a bad value is dropped, not an error.
      const productId = typeof it.productId === "string" && /^[A-Z0-9]{10}$/.test(it.productId) ? it.productId : null;
      const category = text(it.category, LIMITS.category);
      items.push({ name, cents: it.cents as number, quantity: quantity as number, shipmentKey: key, shipDate, productId, category });
    }
    const outCharges: SyncCharge[] = [];
    for (const [j, r] of (charges as unknown[]).entries()) {
      const c = (r ?? {}) as Record<string, unknown>;
      const last4 = c.last4 == null ? null : typeof c.last4 === "string" && /^\d{4}$/.test(c.last4) ? c.last4 : undefined;
      if (!isDay(c.date) || !isCents(c.cents) || c.cents === 0 || last4 === undefined) {
        issues[`${at}.charges.${j}`] = ["Needs date, cents and an optional 4-digit last4"];
        return;
      }
      outCharges.push({ date: c.date, cents: c.cents as number, last4 });
    }
    orders.push({ orderId, orderDate: o.orderDate, items, charges: outCharges });
  });
  return Object.keys(issues).length ? { issues } : { orders };
}

/** The order's items in the shape the CSV import uses. Quantity is folded into the amount. */
export function toOrderItems(order: SyncOrder): OrderItem[] {
  return order.items.map((it) => ({
    orderId: order.orderId,
    orderDate: order.orderDate,
    shipDate: it.shipDate,
    shipmentKey: `${order.orderId}|${it.shipmentKey}`,
    name: it.name,
    department: it.category ?? "",
    cents: it.cents * it.quantity,
    kind: kindFromCategory(it.category) ?? itemKind(it.name),
    productId: it.productId ?? null,
  }));
}

const gap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/**
 * Which items each of an order's charges paid for. One charge: all of them. Several: each
 * shipment goes to the charge closest to its share (its items' total, scaled up by the
 * order's tax and shipping), so a split charge never holds another shipment's items.
 */
export function itemsPerCharge(order: SyncOrder): Array<{ charge: SyncCharge; items: OrderItem[] }> {
  const items = toOrderItems(order);
  const charges = [...order.charges].sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents);
  if (!charges.length) return [];
  if (charges.length === 1) return [{ charge: charges[0], items }];
  const groups = shipments(items);
  const itemTotal = items.reduce((s, i) => s + i.cents, 0);
  const chargeTotal = charges.reduce((s, c) => s + c.cents, 0);
  const scale = itemTotal > 0 ? chargeTotal / itemTotal : 1;
  const out = charges.map((charge) => ({ charge, items: [] as OrderItem[], left: charge.cents }));
  // Biggest shipments first, each to the charge with the most room left for it.
  for (const g of [...groups].sort((a, b) => b.cents - a.cents)) {
    const want = g.cents * scale;
    const best = [...out].sort((a, b) => Math.abs(a.left - want) - Math.abs(b.left - want) || gap(a.charge.date, g.date) - gap(b.charge.date, g.date))[0];
    best.items.push(...g.items);
    best.left -= want;
  }
  // A charge left with nothing (a second charge for the same shipment): share the order's items.
  return out.map(({ charge, items: own }) => ({ charge, items: own.length ? own : items }));
}

/** Pairs every order's charges with bank charges, each bank charge used once. */
export function planSync(orders: SyncOrder[], bank: BankCharge[], today: string): SyncPlan {
  const used = new Set<string>();
  const toSplit: SyncMatch[] = [];
  const waiting = new Set<string>();
  const lost = new Set<string>();
  let matched = 0;

  const find = (cents: number, date: string, last4: string | null) =>
    bank
      .filter(
        (b) =>
          !used.has(b.id) &&
          Math.abs(b.cents - cents) <= 1 &&
          gap(b.postedOn, date) <= WINDOW_DAYS &&
          // A card whose name shows other digits isn't the one Amazon charged.
          !(last4 && b.last4 && b.last4 !== last4),
      )
      .sort((a, b) => gap(a.postedOn, date) - gap(b.postedOn, date) || Number(a.split) - Number(b.split))[0];

  const done = new Set<string>();
  const listed = orders.filter((o) => o.charges.length);
  for (const order of listed) {
    let all = true;
    for (const { charge, items } of itemsPerCharge(order)) {
      const hit = find(charge.cents, charge.date, charge.last4);
      if (!hit) {
        all = false;
        if (gap(charge.date, today) <= WAIT_DAYS) waiting.add(order.orderId);
        else lost.add(order.orderId);
        continue;
      }
      used.add(hit.id);
      matched++;
      if (!hit.split) toSplit.push({ chargeId: hit.id, cents: hit.cents, items });
    }
    if (all) done.add(order.orderId);
  }

  // No charge list: amounts from the items, as the CSV import does.
  const bare = orders.filter((o) => !o.charges.length);
  const rest = bare.flatMap(toOrderItems);
  const found = new Set<string>();
  if (rest.length) {
    const open = bank.filter((b) => !used.has(b.id));
    for (const m of matchCharges(shipments(rest), open.map((b) => ({ id: b.id, postedOn: b.postedOn, cents: b.cents })))) {
      const hit = open.find((b) => b.id === m.chargeId)!;
      for (const i of m.items) found.add(i.orderId);
      used.add(hit.id);
      matched++;
      if (!hit.split) toSplit.push({ chargeId: hit.id, cents: hit.cents, items: m.items });
    }
  }

  const since = orders.filter((o) => waiting.has(o.orderId)).map((o) => o.orderDate).sort()[0] ?? null;
  const noChargeList = bare.filter((o) => !found.has(o.orderId)).length;
  for (const id of found) done.add(id);
  return { toSplit, matched, waiting: [...waiting], waitingSince: since, noMatch: [...lost].filter((id) => !waiting.has(id)).length, noChargeList, done: orders.flatMap((o, i) => (done.has(o.orderId) ? [i] : [])) };
}

/**
 * The last 4 digits a card's name or nickname shows ("Card …0000", "(0000)", "x0000",
 * "ending in 0000"), if any. A bare year like "Rewards 2024" doesn't count.
 */
export function last4From(...names: Array<string | null | undefined>): string | null {
  for (const n of names) {
    const m = n ? /(?:…|\.{2,}|[x*#•]+|\(|ending(?: in)?\s|-)\s*(\d{4})\)?\s*$/i.exec(n.trim()) : null;
    if (m) return m[1];
  }
  return null;
}

/** Where the next sync should start: a week before the newest split Amazon charge, else 90 days back. */
export function syncFrom(newestSplit: string | null, today: string): string {
  const base = newestSplit ? Date.parse(`${newestSplit}T00:00:00Z`) - 7 * DAY : Date.parse(`${today}T00:00:00Z`) - 90 * DAY;
  return new Date(base).toISOString().slice(0, 10);
}
