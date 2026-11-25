/**
 * Money people owe you: part or all of a charge marked as someone's, and their payments back.
 *
 * A person is a "for others" category, so their share stays out of your spending and budgets from
 * the day it's marked, in the month of the charge. The charge is split in two: the person's share
 * (source "owed") and the rest (source "owed-rest", kept in the charge's own category). A payment
 * back is a money-in transaction in the person's category; paybacks cover the oldest charges first.
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
  txnId: string;
  postedOn: string;
  merchant: string;
  /** What they owe for it. */
  cents: number;
  /** How much of it their payments have covered, oldest charge first. */
  coveredCents: number;
}

export interface OwedPerson extends Person {
  charges: OwedCharge[];
  paybacks: Array<{ txnId: string; postedOn: string; merchant: string; cents: number }>;
  markedCents: number;
  paidCents: number;
  /** Still owed; negative when they've paid ahead. */
  openCents: number;
}

/** Each person's charges and paybacks, with what's still open. */
export async function owedSummary(): Promise<OwedPerson[]> {
  const list = await people();
  const out: OwedPerson[] = [];
  for (const p of list) {
    const whole = (await prisma.bankTransaction.findMany({
      where: { categoryId: p.id, pending: false, kind: "NORMAL", splits: { none: {} }, account: { hidden: false } },
      select: { id: true, postedOn: true, amount: true, merchant: true },
    })) as Array<{ id: string; postedOn: Date; amount: { toString(): string }; merchant: string }>;
    const parts = (await prisma.transactionSplit.findMany({
      where: { categoryId: p.id, transaction: { pending: false, account: { hidden: false } } },
      select: { amount: true, transaction: { select: { id: true, postedOn: true, merchant: true } } },
    })) as Array<{ amount: { toString(): string }; transaction: { id: string; postedOn: Date; merchant: string } }>;
    const rows = [
      ...whole.map((w) => ({ txnId: w.id, postedOn: w.postedOn.toISOString().slice(0, 10), merchant: w.merchant, cents: toCents(w.amount) })),
      ...parts.map((x) => ({ txnId: x.transaction.id, postedOn: x.transaction.postedOn.toISOString().slice(0, 10), merchant: x.transaction.merchant, cents: toCents(x.amount) })),
    ].sort((a, b) => a.postedOn.localeCompare(b.postedOn));
    const charges = rows.filter((r) => r.cents < 0).map((r) => ({ txnId: r.txnId, postedOn: r.postedOn, merchant: r.merchant, cents: -r.cents, coveredCents: 0 }));
    const paybacks = rows.filter((r) => r.cents > 0);
    const paidCents = paybacks.reduce((s, r) => s + r.cents, 0);
    let left = paidCents;
    for (const c of charges) {
      c.coveredCents = Math.min(c.cents, left);
      left -= c.coveredCents;
    }
    const markedCents = charges.reduce((s, c) => s + c.cents, 0);
    if (!charges.length && !paybacks.length) continue;
    out.push({ ...p, charges, paybacks, markedCents, paidCents, openCents: markedCents - paidCents });
  }
  return out.sort((a, b) => b.openCents - a.openCents || a.name.localeCompare(b.name));
}
