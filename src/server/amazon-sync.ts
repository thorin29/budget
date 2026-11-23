/**
 * The Amazon browser extension's side of Ledger: orders it read from Amazon are matched to bank
 * charges and split by item (src/lib/amazon-sync.ts), and each sync's outcome is kept in the
 * one AmazonSync row (read by src/server/amazon-alert.ts).
 *
 * Kept: one split per item with its amount, category, name (encrypted, as the note) and a keyed
 * hash of the item (src/server/amazon-items.ts) so a category the person fixes sticks. Order
 * numbers, card digits, dates and anything else from Amazon are used for matching and dropped.
 * Answers carry counts only, because replayed answers are stored as they are.
 */

import { prisma } from "@/lib/prisma";
import { toCents, toDecimalString } from "@/lib/money";
import { KINDS, splitByItem, type ItemKind } from "@/lib/amazon-orders";
import { last4From, planSync, syncFrom, WAIT_DAYS, type BankCharge, type SyncOrder } from "@/lib/amazon-sync";
import { itemKeys, itemRules, ruleFor } from "./amazon-items";

const AMAZON = /amazon|amzn|amz\b|amz\*|prime ?video|whole ?foods|wholefds/i;
/** Charges with no order behind them (memberships, digital, AWS), as the Transactions page uses. */
const AMAZON_DIGITAL = /prime|kindle|audible|digital|music|aws|web services/i;
/** Amazon-owned stores whose charges never have an Amazon order: Whole Foods in store, Woot. */
const AMAZON_NO_ORDER = /wholefds|whole ?foods|woot/i;
const DAY = 86_400_000;
export const SYNC_STATUSES = ["ok", "amazon_signed_out", "captcha", "parse_failed", "ledger_error"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY);

type Row = {
  id: string;
  postedOn: Date;
  amount: { toString(): string };
  merchant: string;
  description: string;
  account: { name: string; nickname: string | null };
  _count: { splits: number };
};

/** Amazon card charges around the orders' dates, split or not. */
async function bankCharges(orders: SyncOrder[]): Promise<BankCharge[]> {
  const days = orders.flatMap((o) => [o.orderDate, ...o.charges.map((c) => c.date), ...o.items.flatMap((i) => (i.shipDate ? [i.shipDate] : []))]).sort();
  const rows = (await prisma.bankTransaction.findMany({
    where: {
      postedOn: { gte: shift(days[0], -7), lte: shift(days[days.length - 1], WAIT_DAYS) },
      amount: { lt: 0 },
      kind: "NORMAL",
      pending: false,
      account: { hidden: false },
    },
    select: {
      id: true,
      postedOn: true,
      amount: true,
      merchant: true,
      description: true,
      account: { select: { name: true, nickname: true } },
      _count: { select: { splits: true } },
    },
  })) as Row[];
  const amazon = rows.filter((r) => AMAZON.test(r.merchant) || AMAZON.test(r.description));
  return amazon.map((r) => ({
    id: r.id,
    postedOn: iso(r.postedOn),
    cents: -toCents(r.amount),
    last4: last4From(r.account.nickname, r.account.name),
    split: r._count.splits > 0,
  }));
}

/** The category each kind goes to: an existing one by name, else one made for it (as the CSV import does). */
async function categoriesForKinds(kinds: Set<ItemKind>): Promise<Map<ItemKind, string>> {
  const existing = (await prisma.category.findMany({ where: { managedForOthers: false }, select: { id: true, name: true } })) as Array<{ id: string; name: string }>;
  const out = new Map<ItemKind, string>();
  for (const kind of kinds) {
    const k = KINDS.find((x) => x.kind === kind);
    if (!k) continue;
    const hit = existing.find((c) => k.matches.test(c.name.trim()));
    if (hit) {
      out.set(kind, hit.id);
      continue;
    }
    const made = (await prisma.category.upsert({ where: { name: k.name }, create: { name: k.name }, update: {}, select: { id: true, name: true } })) as { id: string; name: string };
    existing.push(made);
    out.set(kind, made.id);
  }
  return out;
}

export interface SyncResult {
  matched: number;
  split: number;
  waiting: number;
  waitingSince: string | null;
  noMatch: number;
  noChargeList: number;
  /** Positions of finished orders in the batch (see planSync). */
  done: number[];
}

/** Splits the orders' charges that aren't split yet. Sending the same orders again changes nothing. */
export async function syncAmazonOrders(orders: SyncOrder[], now = new Date()): Promise<SyncResult> {
  const list = await bankCharges(orders);
  const plan = planSync(orders, list, iso(now));
  let split = 0;
  if (plan.toSplit.length) {
    const category = await categoriesForKinds(new Set(plan.toSplit.flatMap((m) => m.items.map((i) => i.kind))));
    const importId = `amazon-ext-${now.getTime().toString(36)}`;
    const rules = await itemRules();
    for (const m of plan.toSplit) {
      const data = splitByItem(m.cents, m.items).map((p) => {
        const keys = itemKeys(p.item.name, p.item.productId);
        return {
          transactionId: m.chargeId,
          // A category the person fixed for this item wins. An item that can't be placed gets no
          // category (it shows under Needs a category) instead of the charge's guessed one.
          categoryId: ruleFor(rules, keys) ?? (p.item.kind === "other" ? null : (category.get(p.item.kind) ?? null)),
          amount: toDecimalString(-p.cents),
          note: p.item.name.slice(0, 500),
          source: "amazon",
          importId,
          itemKey: keys[0] ?? null,
        };
      });
      const wrote = await prisma.$transaction(async (tx) => {
        // Two syncs at once: the first one's splits stand.
        if ((await tx.transactionSplit.count({ where: { transactionId: m.chargeId } })) > 0) return false;
        for (const d of data) await tx.transactionSplit.create({ data: d });
        return true;
      });
      if (wrote) split++;
    }
  }
  return { matched: plan.matched, split, waiting: plan.waiting.length, waitingSince: plan.waitingSince, noMatch: plan.noMatch, noChargeList: plan.noChargeList, done: plan.done };
}

/** What the extension's popup shows, and where its next sync should start. */
export async function amazonSyncStatus(now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row, thisMonth, newest] = await Promise.all([
    prisma.amazonSync.findUnique({ where: { id: "default" } }) as Promise<{
      lastRunAt: Date | null;
      lastSuccessAt: Date | null;
      lastStatus: string | null;
      ordersWaiting: number;
    } | null>,
    prisma.transactionSplit.findMany({
      where: { source: "amazon", transaction: { postedOn: { gte: monthStart } } },
      distinct: ["transactionId"],
      select: { transactionId: true },
    }) as Promise<unknown[]>,
    prisma.bankTransaction.findFirst({
      where: { splits: { some: { source: "amazon" } } },
      orderBy: { postedOn: "desc" },
      select: { postedOn: true },
    }) as Promise<{ postedOn: Date } | null>,
  ]);
  return {
    lastRunAt: row?.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
    lastStatus: row?.lastStatus ?? null,
    chargesSplitThisMonth: thisMonth.length,
    ordersWaiting: row?.ordersWaiting ?? 0,
    syncFrom: syncFrom(newest ? iso(newest.postedOn) : null, iso(now)),
  };
}

export interface RunReport {
  status: SyncStatus;
  failedSection: string | null;
  extensionVersion: string;
  ordersWaiting: number;
}

/** Records how a sync went. Only an "ok" run moves lastSuccessAt. */
export async function recordAmazonRun(report: RunReport, now = new Date()): Promise<void> {
  const charges = (await prisma.transactionSplit.findMany({ where: { source: "amazon" }, distinct: ["transactionId"], select: { transactionId: true } })) as unknown[];
  const ok = report.status === "ok";
  const data = {
    lastRunAt: now,
    lastStatus: report.status,
    failedSection: ok ? null : report.failedSection,
    extensionVersion: report.extensionVersion,
    chargesSplit: charges.length,
    ordersWaiting: report.ordersWaiting,
    ...(ok ? { lastSuccessAt: now } : {}),
  };
  await prisma.amazonSync.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
}

export interface UnsplitCharge {
  /** YYYY-MM-DD */
  date: string;
  cents: number;
  last4: string | null;
}

/**
 * Amazon card charges in the last `days` that have no split yet, oldest first, so the extension
 * reads only the orders it still needs. Digital and membership charges, Whole Foods in store and
 * Woot are left out: they have no Amazon order.
 */
export async function unsplitAmazonCharges(days = 120, now = new Date()): Promise<UnsplitCharge[]> {
  const rows = (await prisma.bankTransaction.findMany({
    where: {
      postedOn: { gte: new Date(now.getTime() - days * DAY) },
      amount: { lt: 0 },
      kind: "NORMAL",
      pending: false,
      account: { hidden: false },
      splits: { none: {} },
    },
    orderBy: { postedOn: "asc" },
    select: { postedOn: true, amount: true, merchant: true, description: true, account: { select: { name: true, nickname: true } } },
  })) as Array<{ postedOn: Date; amount: { toString(): string }; merchant: string; description: string; account: { name: string; nickname: string | null } }>;
  return rows
    .filter((r) => {
      const text = `${r.merchant} ${r.description}`;
      return AMAZON.test(text) && !AMAZON_DIGITAL.test(text) && !AMAZON_NO_ORDER.test(text);
    })
    .slice(0, 300)
    .map((r) => ({ date: iso(r.postedOn), cents: -toCents(r.amount), last4: last4From(r.account.nickname, r.account.name) }));
}
