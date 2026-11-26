/**
 * Money people owe you: part or all of a charge marked as someone's, and their payments back.
 *
 * A person is a "for others" category, so their share stays out of your spending and budgets from
 * the day it's marked, in the month of the charge. The charge is split in two: the person's share
 * (source "owed") and the rest (source "owed-rest", kept in the charge's own category). A payment
 * back is a money-in transaction in the person's category. A payment tied to charges (OwedLink)
 * covers those; what isn't tied covers the oldest open charges.
 */

import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { isAmazonCharge } from "@/lib/amazon-orders";
import { NotFoundError, ValidationError } from "./errors";

export interface Person {
  id: string;
  name: string;
}

/** Everyone with a "for others" category. */
export async function people(): Promise<Person[]> {
  return (await prisma.category.findMany({
    where: { managedForOthers: true, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })) as Person[];
}

/** Adds a person (their "for others" category), or finds them by name. */
export async function addPerson(rawName: unknown): Promise<Person> {
  const name = String(rawName ?? "").trim().slice(0, 40);
  if (!name) throw new ValidationError({ name: ["Enter a name"] });
  const existing = (await prisma.category.findUnique({ where: { name }, select: { id: true, managedForOthers: true } })) as { id: string; managedForOthers: boolean } | null;
  if (existing && !existing.managedForOthers) throw new ValidationError({ name: ["A budget category already has that name"] });
  return (await prisma.category.upsert({
    where: { name },
    create: { name, managedForOthers: true },
    update: { active: true },
    select: { id: true, name: true },
  })) as Person;
}

/**
 * Marks [cents] of a charge as owed by [personId] (null clears it). The charge keeps its category
 * for the rest. An Amazon charge is marked per item instead (in its item list).
 */
export async function setOwed(txnId: string, personId: string | null, cents: number | null): Promise<void> {
  const t = (await prisma.bankTransaction.findUnique({
    where: { id: txnId },
    select: { id: true, amount: true, pending: true, kind: true, categoryId: true, merchant: true, description: true, splits: { select: { source: true } }, category: { select: { managedForOthers: true } } },
  })) as {
    id: string; amount: { toString(): string }; pending: boolean; kind: string; categoryId: string | null; merchant: string; description: string;
    splits: Array<{ source: string }>; category: { managedForOthers: boolean } | null;
  } | null;
  if (!t) throw new NotFoundError("Transaction");
  if (t.splits.some((s) => s.source !== "owed" && s.source !== "owed-rest")) throw new ValidationError({ owed: ["Mark the item someone owes you for in its item list"] });
  await prisma.transactionSplit.deleteMany({ where: { transactionId: t.id, source: { in: ["owed", "owed-rest"] } } });
  if (!personId) return;
  const total = -toCents(t.amount);
  if (t.kind !== "NORMAL" || total <= 0) throw new ValidationError({ owed: ["Only a charge can be owed to you"] });
  if (t.pending) throw new ValidationError({ owed: ["Mark it once it posts"] });
  if (t.category?.managedForOthers) throw new ValidationError({ owed: ["This charge is already someone else's"] });
  if (isAmazonCharge(t)) throw new ValidationError({ owed: ["Mark the item once the Amazon order splits it"] });
  const person = (await prisma.category.findUnique({ where: { id: personId }, select: { managedForOthers: true } })) as { managedForOthers: boolean } | null;
  if (!person?.managedForOthers) throw new ValidationError({ owed: ["Pick who owes you"] });
  const share = cents === null ? total : Math.round(cents);
  if (!(share > 0) || share > total) throw new ValidationError({ owed: [`Enter an amount up to $${(total / 100).toFixed(2)}`] });
  await prisma.transactionSplit.create({ data: { transactionId: t.id, categoryId: personId, amount: (-share / 100).toFixed(2), source: "owed" } });
  if (share < total) await prisma.transactionSplit.create({ data: { transactionId: t.id, categoryId: t.categoryId, amount: (-(total - share) / 100).toFixed(2), source: "owed-rest" } });
}

/** Keeps the rest of each owed charge in the charge's own category after it changes. */
export async function syncOwedRest(): Promise<void> {
  const rows = (await prisma.transactionSplit.findMany({
    where: { source: "owed-rest" },
    select: { id: true, categoryId: true, transaction: { select: { categoryId: true } } },
  })) as Array<{ id: string; categoryId: string | null; transaction: { categoryId: string | null } }>;
  for (const r of rows) if (r.categoryId !== r.transaction.categoryId) await prisma.transactionSplit.update({ where: { id: r.id }, data: { categoryId: r.transaction.categoryId } });
}

export interface OwedCharge {
  /** The owed part's split id, or the transaction id when the whole charge is theirs. */
  key: string;
  txnId: string;
  postedOn: string;
  merchant: string;
  /** The charge's own category (what the rest of it is), when it has one. */
  categoryName: string | null;
  /** What they owe for it. */
  cents: number;
  /** How much their payments have covered. */
  coveredCents: number;
  /** Payments tied to it. */
  paidBy: Array<{ txnId: string; postedOn: string }>;
}

export interface OwedPayback {
  txnId: string;
  postedOn: string;
  merchant: string;
  cents: number;
  /** How much of it is tied to charges. */
  linkedCents: number;
}

export interface OwedMatch {
  txnId: string;
  postedOn: string;
  merchant: string;
  cents: number;
  /** The open charges it adds up to exactly; empty when it doesn't add up to any. */
  chargeKeys: string[];
}

export interface OwedPerson extends Person {
  charges: OwedCharge[];
  paybacks: OwedPayback[];
  markedCents: number;
  paidCents: number;
  /** Still owed; negative when they've paid ahead. */
  openCents: number;
  /** Money in that adds up to some of their open charges. */
  matches: OwedMatch[];
  /** Other money in that could be theirs (a payment app, or a sender already tied to them). */
  maybe: OwedMatch[];
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Money sent person to person. */
export const PAYMENT_APP = /zelle|venmo|paypal|cash ?app|square cash|apple cash|transfer|xfer/i;
const DISMISSED = "owedMatchDismissed";

async function dismissed(): Promise<Set<string>> {
  const row = (await prisma.setting.findUnique({ where: { key: DISMISSED } })) as { value: unknown } | null;
  return new Set(Array.isArray(row?.value) ? (row!.value as string[]) : []);
}

/** The fewest open charges (oldest first) whose amounts add up to [cents] exactly; null when none do. */
export function chargesAddingUpTo(open: Array<{ key: string; cents: number }>, cents: number): string[] | null {
  const list = open.filter((c) => c.cents > 0).slice(0, 16);
  let best: string[] | null = null;
  const n = list.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    const keys: string[] = [];
    for (let i = 0; i < n; i++)
      if (mask & (1 << i)) {
        sum += list[i].cents;
        keys.push(list[i].key);
      }
    if (sum === cents && (!best || keys.length < best.length)) best = keys;
  }
  return best;
}

/** Each person's charges, payments back, what's still open, and money in that may be theirs. */
export async function owedSummary(now = new Date()): Promise<OwedPerson[]> {
  const list = await people();
  if (!list.length) return [];
  const ids = list.map((p) => p.id);
  const hidden = { account: { hidden: false } };
  const whole = (await prisma.bankTransaction.findMany({
    where: { categoryId: { in: ids }, pending: false, kind: "NORMAL", splits: { none: {} }, ...hidden },
    select: { id: true, postedOn: true, amount: true, merchant: true, categoryId: true },
  })) as Array<{ id: string; postedOn: Date; amount: { toString(): string }; merchant: string; categoryId: string }>;
  const parts = (await prisma.transactionSplit.findMany({
    where: { categoryId: { in: ids }, transaction: { pending: false, ...hidden } },
    select: { id: true, amount: true, categoryId: true, transaction: { select: { id: true, postedOn: true, merchant: true, category: { select: { name: true } } } } },
  })) as Array<{ id: string; amount: { toString(): string }; categoryId: string; transaction: { id: string; postedOn: Date; merchant: string; category: { name: string } | null } }>;
  const links = (await prisma.owedLink.findMany({ select: { paybackId: true, chargeKey: true, amount: true, payback: { select: { postedOn: true } } } })) as Array<{
    paybackId: string; chargeKey: string; amount: { toString(): string }; payback: { postedOn: Date };
  }>;
  const linkedIds = new Set(links.map((l) => l.paybackId));
  const since = new Date(now.getTime() - 180 * DAY);
  const incoming = (await prisma.bankTransaction.findMany({
    where: { amount: { gt: 0 }, kind: "NORMAL", pending: false, postedOn: { gte: since }, ...hidden, OR: [{ categoryId: null }, { category: { managedForOthers: false } }, { categoryId: { in: ids } }] },
    select: { id: true, postedOn: true, amount: true, merchant: true, description: true, categoryId: true },
    orderBy: { postedOn: "desc" },
  })) as Array<{ id: string; postedOn: Date; amount: { toString(): string }; merchant: string; description: string; categoryId: string | null }>;
  const skip = await dismissed();

  const out: OwedPerson[] = [];
  for (const p of list) {
    const rows = [
      ...whole.filter((w) => w.categoryId === p.id).map((w) => ({ key: w.id, txnId: w.id, postedOn: iso(w.postedOn), merchant: w.merchant, categoryName: null as string | null, cents: toCents(w.amount) })),
      ...parts.filter((x) => x.categoryId === p.id).map((x) => ({ key: x.id, txnId: x.transaction.id, postedOn: iso(x.transaction.postedOn), merchant: x.transaction.merchant, categoryName: x.transaction.category?.name ?? null, cents: toCents(x.amount) })),
    ].sort((a, b) => a.postedOn.localeCompare(b.postedOn));
    const charges: OwedCharge[] = rows.filter((r) => r.cents < 0).map((r) => ({ ...r, cents: -r.cents, coveredCents: 0, paidBy: [] }));
    const paybacks: OwedPayback[] = rows.filter((r) => r.cents > 0).map((r) => ({ txnId: r.txnId, postedOn: r.postedOn, merchant: r.merchant, cents: r.cents, linkedCents: 0 }));
    const byKey = new Map(charges.map((c) => [c.key, c]));
    for (const b of paybacks)
      for (const l of links.filter((x) => x.paybackId === b.txnId)) {
        const c = byKey.get(l.chargeKey);
        if (!c) continue;
        const cents = Math.min(toCents(l.amount), c.cents - c.coveredCents);
        c.coveredCents += cents;
        c.paidBy.push({ txnId: b.txnId, postedOn: b.postedOn });
        b.linkedCents += cents;
      }
    // What isn't tied to charges covers the oldest open ones.
    let free = paybacks.reduce((t, b) => t + (b.cents - b.linkedCents), 0);
    for (const c of charges) {
      const add = Math.min(free, c.cents - c.coveredCents);
      c.coveredCents += add;
      free -= add;
    }
    const markedCents = charges.reduce((t, c) => t + c.cents, 0);
    const paidCents = paybacks.reduce((t, b) => t + b.cents, 0);
    const open = charges.filter((c) => c.coveredCents < c.cents).map((c) => ({ key: c.key, cents: c.cents - c.coveredCents }));
    const senders = new Set(paybacks.map((b) => b.merchant.toLowerCase()));
    const matches: OwedMatch[] = [];
    const maybe: OwedMatch[] = [];
    if (open.length)
      for (const t of incoming) {
        if (linkedIds.has(t.id) || skip.has(`${p.id}:${t.id}`)) continue;
        if (t.categoryId && t.categoryId !== p.id && ids.includes(t.categoryId)) continue;
        const theirs = t.categoryId === p.id;
        // A payment already in their name that isn't tied yet is counted above; offer it to tie.
        const likely = theirs || PAYMENT_APP.test(`${t.merchant} ${t.description}`) || senders.has(t.merchant.toLowerCase());
        if (!likely) continue;
        const cents = toCents(t.amount);
        const keys = chargesAddingUpTo(open, cents);
        const m = { txnId: t.id, postedOn: iso(t.postedOn), merchant: t.merchant, cents, chargeKeys: keys ?? [] };
        if (keys) matches.push(m);
        else if (t.postedOn.getTime() >= now.getTime() - 60 * DAY) maybe.push(m);
      }
    if (!charges.length && !paybacks.length) continue;
    out.push({ ...p, charges, paybacks, markedCents, paidCents, openCents: markedCents - paidCents, matches, maybe: maybe.slice(0, 8) });
  }
  return out.sort((a, b) => b.openCents - a.openCents || a.name.localeCompare(b.name));
}

/**
 * Ties a payment back to some of a person's charges and puts it in their name. Each charge takes
 * what's still open on it, oldest first, until the payment runs out; any extra counts as paid ahead.
 */
export async function linkPayback(personId: string, txnId: string, chargeKeys: string[]): Promise<void> {
  const t = (await prisma.bankTransaction.findUnique({ where: { id: txnId }, select: { id: true, amount: true, kind: true } })) as { id: string; amount: { toString(): string }; kind: string } | null;
  if (!t) throw new NotFoundError("Transaction");
  if (t.kind !== "NORMAL" || toCents(t.amount) <= 0) throw new ValidationError({ payback: ["Only money in can pay someone's charges"] });
  const person = (await prisma.category.findUnique({ where: { id: personId }, select: { managedForOthers: true } })) as { managedForOthers: boolean } | null;
  if (!person?.managedForOthers) throw new ValidationError({ payback: ["Pick who paid you back"] });
  await prisma.owedLink.deleteMany({ where: { paybackId: t.id } });
  await prisma.bankTransaction.update({ where: { id: t.id }, data: { categoryId: personId, categorySource: "person" } });
  const summary = (await owedSummary()).find((p) => p.id === personId);
  let left = toCents(t.amount);
  for (const c of (summary?.charges ?? []).filter((x) => chargeKeys.includes(x.key))) {
    // What other payments are already tied to it.
    const tied = (await prisma.owedLink.aggregate({ where: { chargeKey: c.key }, _sum: { amount: true } })) as { _sum: { amount: { toString(): string } | null } };
    const cents = Math.min(left, c.cents - (tied._sum.amount ? toCents(tied._sum.amount) : 0));
    if (cents <= 0) continue;
    await prisma.owedLink.create({ data: { paybackId: t.id, chargeKey: c.key, amount: (cents / 100).toFixed(2) } });
    left -= cents;
    if (!left) break;
  }
}

/** Unties a payment from charges and takes it out of the person's name. */
export async function unlinkPayback(txnId: string): Promise<void> {
  await prisma.owedLink.deleteMany({ where: { paybackId: txnId } });
  const t = (await prisma.bankTransaction.findUnique({ where: { id: txnId }, select: { category: { select: { managedForOthers: true } } } })) as { category: { managedForOthers: boolean } | null } | null;
  if (t?.category?.managedForOthers) await prisma.bankTransaction.update({ where: { id: txnId }, data: { categoryId: null, categorySource: "guess" } });
}

/** "Not this": stops suggesting a payment for a person. */
export async function dismissMatch(personId: string, txnId: string): Promise<void> {
  const set = await dismissed();
  set.add(`${personId}:${txnId}`);
  const value = [...set].slice(-500);
  await prisma.setting.upsert({ where: { key: DISMISSED }, create: { key: DISMISSED, value: value as never }, update: { value: value as never } });
}

/** Payment-app money in that adds up exactly to someone's charges, for Review to approve. */
export async function paybacksToApprove(): Promise<Array<OwedMatch & { personId: string; personName: string; charges: Array<{ postedOn: string; merchant: string; cents: number }> }>> {
  const out: Array<OwedMatch & { personId: string; personName: string; charges: Array<{ postedOn: string; merchant: string; cents: number }> }> = [];
  for (const p of await owedSummary()) {
    for (const m of p.matches) {
      const t = (await prisma.bankTransaction.findUnique({ where: { id: m.txnId }, select: { description: true, merchant: true, categoryId: true } })) as { description: string; merchant: string; categoryId: string | null } | null;
      if (!t || t.categoryId === p.id || !PAYMENT_APP.test(`${t.merchant} ${t.description}`)) continue;
      const charges = p.charges.filter((c) => m.chargeKeys.includes(c.key)).map((c) => ({ postedOn: c.postedOn, merchant: c.merchant, cents: c.cents - c.coveredCents }));
      out.push({ ...m, personId: p.id, personName: p.name, charges });
    }
  }
  return out;
}
