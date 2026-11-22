/**
 * Cards used by others: people with their own card on one of your accounts (family who pay you
 * back). Each person gets a "for others" category, kept out of your spending and income, and a
 * monthly card file from the issuer moves their charges into it (src/lib/card-file.ts).
 *
 * Kept: each person's name, the card's last 4, the account and their category (a setting), and
 * when the last file was loaded. The file itself is read and dropped.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { lastCloseDate } from "@/lib/card-payment";
import { matchCardFile, parseCardFile } from "@/lib/card-file";
import { ValidationError } from "./errors";

const KEY = "cardHolders";
const LAST = "cardFileLastAt";
const DAY = 86_400_000;

export interface CardHolder {
  id: string;
  name: string;
  last4: string;
  accountId: string;
  categoryId: string;
}

const Holder = z.object({ id: z.string(), name: z.string(), last4: z.string().regex(/^\d{4}$/), accountId: z.string(), categoryId: z.string() });

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function cardHolders(): Promise<CardHolder[]> {
  const row = (await prisma.setting.findUnique({ where: { key: KEY } })) as { value: unknown } | null;
  const parsed = z.array(Holder).safeParse(row?.value ?? []);
  return parsed.success ? parsed.data : [];
}

async function save(list: CardHolder[]) {
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: list as never }, update: { value: list as never } });
}

/** Adds a person's card. Makes their "for others" category (or uses one with their name). */
export async function addCardHolder(input: { name: unknown; last4: unknown; accountId: unknown }): Promise<CardHolder> {
  const name = String(input.name ?? "").trim().slice(0, 40);
  const last4 = String(input.last4 ?? "").trim();
  const accountId = String(input.accountId ?? "");
  const issues: Record<string, string[]> = {};
  if (!name) issues.name = ["Enter a name"];
  if (!/^\d{4}$/.test(last4)) issues.last4 = ["Enter the card's last 4 digits"];
  const account = accountId ? await prisma.bankAccount.findUnique({ where: { id: accountId }, select: { id: true, type: true } }) : null;
  if (!account || (account as { type: string }).type !== "CREDIT_CARD") issues.accountId = ["Pick the card account"];
  const list = await cardHolders();
  if (list.some((h) => h.accountId === accountId && h.last4 === last4)) issues.last4 = ["That card is already listed"];
  if (Object.keys(issues).length) throw new ValidationError(issues);
  const category = (await prisma.category.upsert({
    where: { name },
    create: { name, managedForOthers: true },
    update: { managedForOthers: true, active: true },
    select: { id: true },
  })) as { id: string };
  const holder: CardHolder = { id: `h${Date.now().toString(36)}`, name, last4, accountId, categoryId: category.id };
  await save([...list, holder]);
  return holder;
}

/** Stops matching a person's card. Their category and its charges stay as they are. */
export async function removeCardHolder(id: string): Promise<void> {
  await save((await cardHolders()).filter((h) => h.id !== id));
}

export interface CardFileResult {
  /** Per person: charges moved to their category, and the total. */
  moved: Array<{ name: string; count: number; cents: number }>;
  /** Their rows in the file with no charge from the bank yet (still pending, or not synced). */
  notFound: number;
  rows: number;
}

/** Reads the issuer's file and moves each listed card's charges to its person's category. */
export async function applyCardFile(csv: string): Promise<CardFileResult> {
  const holders = await cardHolders();
  if (!holders.length) throw new ValidationError({ file: ["Add whose card it is first"] });
  let rows;
  try {
    rows = parseCardFile(csv);
  } catch (e) {
    throw new ValidationError({ file: [(e as Error).message] });
  }
  if (!rows.length) throw new ValidationError({ file: ["No transactions in this file"] });
  const days = rows.flatMap((r) => [r.postedDate, r.transactionDate]).filter((d): d is string => !!d).sort();
  const from = new Date(Date.parse(`${days[0]}T00:00:00Z`) - 7 * DAY);
  const to = new Date(Date.parse(`${days[days.length - 1]}T00:00:00Z`) + 7 * DAY);
  const accounts = [...new Set(holders.map((h) => h.accountId))];
  const moved = new Map<string, { name: string; count: number; cents: number }>();
  let notFound = 0;
  for (const accountId of accounts) {
    const mine = holders.filter((h) => h.accountId === accountId);
    const charges = (await prisma.bankTransaction.findMany({
      where: { accountId, pending: false, kind: "NORMAL", postedOn: { gte: from, lte: to } },
      select: { id: true, postedOn: true, amount: true },
    })) as Array<{ id: string; postedOn: Date; amount: { toString(): string } }>;
    const feed = charges.map((c) => ({ id: c.id, postedOn: c.postedOn.toISOString().slice(0, 10), cents: toCents(c.amount) }));
    const match = matchCardFile(rows, feed);
    const theirs = new Set(mine.map((h) => h.last4));
    notFound += rows.filter((r) => theirs.has(r.last4)).length - [...match.values()].filter((l) => theirs.has(l)).length;
    for (const [chargeId, last4] of match) {
      const h = mine.find((x) => x.last4 === last4);
      if (!h) continue;
      await prisma.bankTransaction.update({ where: { id: chargeId }, data: { categoryId: h.categoryId, categorySource: "person" } });
      const m = moved.get(h.id) ?? { name: h.name, count: 0, cents: 0 };
      m.count++;
      m.cents += -(feed.find((f) => f.id === chargeId)?.cents ?? 0);
      moved.set(h.id, m);
    }
  }
  await prisma.setting.upsert({ where: { key: LAST }, create: { key: LAST, value: new Date().toISOString() as never }, update: { value: new Date().toISOString() as never } });
  return { moved: [...moved.values()], notFound: Math.max(0, notFound), rows: rows.length };
}

export async function cardFileLastAt(): Promise<string | null> {
  const row = (await prisma.setting.findUnique({ where: { key: LAST } })) as { value: unknown } | null;
  return typeof row?.value === "string" ? row.value : null;
}

/**
 * Whether this month's file is due: someone's card is listed, and no file has been loaded since
 * that account's last statement closed (or in 31 days when its closing day isn't set).
 */
export async function cardFileDue(today = localToday()): Promise<{ due: boolean; since: string | null }> {
  const holders = await cardHolders();
  if (!holders.length) return { due: false, since: null };
  const last = await cardFileLastAt();
  const accounts = (await prisma.bankAccount.findMany({
    where: { id: { in: [...new Set(holders.map((h) => h.accountId))] } },
    select: { statementCloseDay: true },
  })) as Array<{ statementCloseDay: number | null }>;
  const closes = accounts.map((a) => (a.statementCloseDay ? lastCloseDate(today, a.statementCloseDay) : new Date(Date.parse(`${today}T00:00:00Z`) - 31 * DAY).toISOString().slice(0, 10)));
  const since = closes.sort().at(-1) ?? null;
  // A file loaded after the close has every charge of the closed statement.
  const due = !last || (since !== null && last.slice(0, 10) <= since);
  return { due, since };
}
