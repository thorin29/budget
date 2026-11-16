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
