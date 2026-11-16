/**
 * Loading past history from CSV files, one file per feed account. The feed
 * only reaches back about 90 days; a file fills in the year before. Rows the
 * account already has (from the feed or an earlier file) are skipped, and a
 * whole file can be undone.
 */

import { prisma } from "@/lib/prisma";
import { toCents, toDecimalString } from "@/lib/money";
import { cleanMerchant } from "@/lib/merchant";
import { matchDuplicates } from "@/lib/bank-match";
import { parseBankCsv, CsvError, type CsvTransaction } from "@/lib/bank-csv";
import { NotFoundError, ValidationError } from "../errors";
import { refreshTransfers } from "./sync";
import { applyCategories } from "../categorize";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
const DAY = 86_400_000;

export interface CsvPreview {
  layout: string;
  total: number;
  duplicates: number;
  from: string;
  to: string;
  inCents: number;
  outCents: number;
  sample: Array<CsvTransaction & { merchant: string; duplicate: boolean }>;
  problems: string[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function analyze(accountId: string, text: string, flipSigns: boolean) {
  if (typeof text !== "string" || !text.trim()) throw new ValidationError({ file: ["Choose a CSV file"] });
  if (Buffer.byteLength(text, "utf8") > MAX_CSV_BYTES) throw new ValidationError({ file: ["The file is larger than 5 MB"] });
  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new NotFoundError("Bank account");

  let parsed;
  try {
    parsed = parseBankCsv(text, { flipSigns });
  } catch (error) {
    if (error instanceof CsvError) throw new ValidationError({ file: [error.message] });
    throw error;
  }
  const rows = parsed.rows.map((r) => ({ ...r, merchant: cleanMerchant(r.description) }));
  const dates = rows.map((r) => r.postedOn).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  const existing = (await prisma.bankTransaction.findMany({
    where: {
      accountId,
      postedOn: { gte: new Date(Date.parse(`${from}T00:00:00Z`) - 4 * DAY), lte: new Date(Date.parse(`${to}T00:00:00Z`) + 4 * DAY) },
    },
    select: { postedOn: true, amount: true, merchant: true },
  })) as Array<{ postedOn: Date; amount: { toString(): string }; merchant: string }>;
  const matches = matchDuplicates(
    existing.map((e) => ({ postedOn: iso(e.postedOn), amountCents: toCents(e.amount), merchant: e.merchant })),
    rows,
  );
  return { parsed, rows, matches, from, to };
}

export async function previewCsv(accountId: string, text: string, flipSigns = false): Promise<CsvPreview> {
  const { parsed, rows, matches, from, to } = await analyze(accountId, text, flipSigns);
  return {
    layout: parsed.layout,
    total: rows.length,
    duplicates: matches.filter((m) => m !== -1).length,
    from,
    to,
    inCents: rows.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents, 0),
    outCents: rows.filter((r) => r.amountCents < 0).reduce((s, r) => s + r.amountCents, 0),
    sample: rows.slice(0, 8).map((r, i) => ({ ...r, duplicate: matches[i] !== -1 })),
    problems: parsed.problems,
  };
}

export async function importCsv(
  accountId: string,
  text: string,
  flipSigns = false,
  fileName?: string,
): Promise<{ importId: string; added: number; skipped: number }> {
  const { rows, matches, from } = await analyze(accountId, text, flipSigns);
  const keep = rows.filter((_, i) => matches[i] === -1);

  const batch = await prisma.bankImport.create({
    data: { accountId, fileName: fileName?.slice(0, 200) ?? null, added: keep.length, skipped: rows.length - keep.length },
  });
  for (let i = 0; i < keep.length; i += 500) {
    await prisma.bankTransaction.createMany({
      data: keep.slice(i, i + 500).map((r) => ({
        accountId,
        postedOn: new Date(`${r.postedOn}T00:00:00Z`),
        amount: toDecimalString(r.amountCents),
        description: r.description,
        merchant: r.merchant,
        source: "csv",
        importId: batch.id,
      })),
    });
  }
  await refreshTransfers(new Date(Date.parse(`${from}T00:00:00Z`) - 7 * DAY));
  await applyCategories();
  const { runBillAutomation } = await import("../bills-auto");
  await runBillAutomation().catch((error) => console.error("Bill automation:", error instanceof Error ? error.message : error));
  return { importId: batch.id, added: keep.length, skipped: rows.length - keep.length };
}

/** Removes a file's rows, except any the feed has since claimed. */
export async function revertCsvImport(importId: string): Promise<{ removed: number }> {
  const batch = await prisma.bankImport.findUnique({ where: { id: importId } });
  if (!batch || batch.revertedAt) throw new NotFoundError("Import");
  const partners = (await prisma.bankTransaction.findMany({
    where: { importId, externalId: null, transferOfId: { not: null } },
    select: { transferOfId: true },
  })) as Array<{ transferOfId: string }>;
  const removed = await prisma.bankTransaction.deleteMany({ where: { importId, externalId: null } });
  if (partners.length) {
    await prisma.bankTransaction.updateMany({
      where: { id: { in: partners.map((p) => p.transferOfId) } },
      data: { kind: "NORMAL", transferOfId: null },
    });
  }
  await prisma.bankImport.update({ where: { id: importId }, data: { revertedAt: new Date() } });
  return { removed: removed.count };
}

export async function listCsvImports() {
  return prisma.bankImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { account: { select: { name: true, institution: true } } },
  });
}

// ---------------------------------------------------------------- one file for several accounts

/**
 * A combined history file: one row per transaction with the account it
 * belongs to, so a person (or a script that gathered every bank's export)
 * uploads once. Columns: Date, Account ID and/or Institution + Account,
 * Description, Amount (negative is money out). Each account's rows go through
 * the ordinary one-account import, so duplicates are skipped and each
 * account's part can be undone on its own.
 */
interface CombinedLabel {
  date: string;
  description: string;
  amount: string;
  category: string;
  managed: boolean;
}

export interface CombinedPart {
  key: string;
  accountId: string | null;
  label: string;
  total: number;
  duplicates: number;
  from: string;
  to: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").replace(/[^a-z0-9]+/g, " ").trim();

async function splitCombined(text: string) {
  if (typeof text !== "string" || !text.trim()) throw new ValidationError({ file: ["Choose a CSV file"] });
  if (Buffer.byteLength(text, "utf8") > MAX_CSV_BYTES) throw new ValidationError({ file: ["The file is larger than 5 MB"] });
  const { splitCsv, toCsv } = await import("@/lib/bank-csv");
  const table = splitCsv(text);
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [date, id, inst, acct, desc, amount, cat, managed] = ["date", "account id", "institution", "account", "description", "amount", "category", "managed for others"].map(col);
  if (date === -1 || desc === -1 || amount === -1 || (id === -1 && acct === -1)) {
    throw new ValidationError({ file: ["A combined file needs Date, Account ID or Account, Description and Amount columns"] });
  }
  const accounts = (await prisma.bankAccount.findMany({ select: { id: true, institution: true, name: true } })) as Array<{ id: string; institution: string | null; name: string }>;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const resolve = (rowId: string, rowInst: string, rowAcct: string) => {
    if (rowId && byId.has(rowId)) return byId.get(rowId)!;
    const hits = accounts.filter((a) => norm(a.name) === norm(rowAcct) && (!rowInst || norm(a.institution ?? "") === norm(rowInst)));
    return hits.length === 1 ? hits[0] : null;
  };
  const groups = new Map<string, { account: { id: string; institution: string | null; name: string } | null; label: string; rows: string[][]; labels: CombinedLabel[] }>();
  for (const r of table.slice(1)) {
    if (r.length < 3 || !r[date]?.trim()) continue;
    const rowId = id === -1 ? "" : (r[id] ?? "").trim();
    const rowInst = inst === -1 ? "" : (r[inst] ?? "").trim();
    const rowAcct = acct === -1 ? "" : (r[acct] ?? "").trim();
    const key = rowId || `${rowInst}|${rowAcct}`;
    if (!groups.has(key)) {
      const account = resolve(rowId, rowInst, rowAcct);
      groups.set(key, { account, label: [rowInst, rowAcct].filter(Boolean).join(" · ") || rowId, rows: [], labels: [] });
    }
    const g = groups.get(key)!;
    g.rows.push([r[date], r[desc], r[amount]]);
    const category = cat === -1 ? "" : (r[cat] ?? "").trim();
    g.labels.push({ date: r[date], description: r[desc], amount: r[amount], category, managed: managed !== -1 && /^(y|yes|true|1)$/i.test((r[managed] ?? "").trim()) });
  }
  return [...groups].map(([key, g]) => ({ key, account: g.account, label: g.label, labels: g.labels, csv: toCsv(["Date", "Description", "Amount"], g.rows) }));
}

export async function previewCombinedCsv(text: string): Promise<CombinedPart[]> {
  const parts = await splitCombined(text);
  const out: CombinedPart[] = [];
  for (const p of parts) {
    if (!p.account) {
      out.push({ key: p.key, accountId: null, label: p.label, total: 0, duplicates: 0, from: "", to: "" });
      continue;
    }
    const preview = await previewCsv(p.account.id, p.csv);
    out.push({ key: p.key, accountId: p.account.id, label: p.label, total: preview.total, duplicates: preview.duplicates, from: preview.from, to: preview.to });
  }
  return out;
}

/**
 * Categories given in the file: each labeled row's transaction (same amount,
 * within three days) gets that category as if the person set it. A merchant
 * whose every row in the file carries the same category is remembered, so its
 * later charges follow; payment apps never are.
 */
async function applyFileCategories(accountId: string, labels: CombinedLabel[]): Promise<number> {
  const labeled = labels.filter((l) => l.category);
  if (!labeled.length) return 0;
  const { parseDate, parseCents } = await import("@/lib/bank-csv");
  const { merchantKey } = await import("@/lib/field-crypto");
  const { isPeerPayment } = await import("@/lib/category-guess");

  // Categories by name, created (and marked managed for others) as needed.
  const existing = (await prisma.category.findMany({ select: { id: true, name: true, managedForOthers: true } })) as Array<{ id: string; name: string; managedForOthers: boolean }>;
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
  const categoryId = async (name: string, managed: boolean) => {
    let c = byName.get(name.toLowerCase());
    if (!c) {
      c = (await prisma.category.create({ data: { name, managedForOthers: managed }, select: { id: true, name: true, managedForOthers: true } })) as { id: string; name: string; managedForOthers: boolean };
      byName.set(name.toLowerCase(), c);
    } else if (managed && !c.managedForOthers) {
      await prisma.category.update({ where: { id: c.id }, data: { managedForOthers: true } });
      c.managedForOthers = true;
    }
    return c.id;
  };

  const rows = labeled
    .map((l) => ({ ...l, postedOn: parseDate(l.date), cents: parseCents(l.amount) }))
    .filter((l): l is typeof l & { postedOn: string; cents: number } => !!l.postedOn && l.cents !== null);
  if (!rows.length) return 0;
  const dates = rows.map((r) => r.postedOn).sort();
  const txns = (await prisma.bankTransaction.findMany({
    where: { accountId, postedOn: { gte: new Date(Date.parse(`${dates[0]}T00:00:00Z`) - 3 * DAY), lte: new Date(Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) + 3 * DAY) } },
    select: { id: true, postedOn: true, amount: true, categorySource: true },
  })) as Array<{ id: string; postedOn: Date; amount: { toString(): string }; categorySource: string }>;
  const used = new Set<string>();
  let count = 0;
  for (const r of rows) {
    const day = Date.parse(`${r.postedOn}T00:00:00Z`);
    const hit = txns
      .filter((t) => !used.has(t.id) && toCents(t.amount) === r.cents && Math.abs(t.postedOn.getTime() - day) <= 3 * DAY)
      .sort((a, b) => Math.abs(a.postedOn.getTime() - day) - Math.abs(b.postedOn.getTime() - day))[0];
    if (!hit) continue;
    used.add(hit.id);
    await prisma.bankTransaction.update({ where: { id: hit.id }, data: { categoryId: await categoryId(r.category, r.managed), categorySource: "person" } });
    count += 1;
  }

  // Merchants labeled the same way on every one of their rows are remembered.
  const byMerchant = new Map<string, Set<string>>();
  for (const l of labels) {
    const m = cleanMerchant(l.description);
    byMerchant.set(m, new Set([...(byMerchant.get(m) ?? []), l.category]));
  }
  for (const [merchant, cats] of byMerchant) {
    const [only] = [...cats];
    if (cats.size !== 1 || !only || isPeerPayment(merchant)) continue;
    const key = merchantKey(merchant);
    const id = await categoryId(only, false);
    await prisma.categoryRule.upsert({ where: { merchantKey: key }, create: { merchantKey: key, categoryId: id }, update: { categoryId: id } });
  }
  return count;
}

export async function importCombinedCsv(text: string, fileName?: string): Promise<{ added: number; skipped: number; accounts: number; unmatched: string[]; categorized: number }> {
  const parts = await splitCombined(text);
  let added = 0;
  let skipped = 0;
  let accounts = 0;
  let categorized = 0;
  const unmatched: string[] = [];
  for (const p of parts) {
    if (!p.account) {
      unmatched.push(p.label);
      continue;
    }
    const r = await importCsv(p.account.id, p.csv, false, fileName);
    added += r.added;
    skipped += r.skipped;
    accounts += 1;
    categorized += await applyFileCategories(p.account.id, p.labels);
  }
  if (categorized) await applyCategories();
  return { added, skipped, accounts, unmatched, categorized };
}
