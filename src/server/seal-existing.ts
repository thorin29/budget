/**
 * Encrypts rows written before field encryption existed (or while no key was
 * set). Runs once at server start when a key is configured; each pass picks up
 * only values still in plain text, so it is safe to repeat and resumes after
 * an interruption.
 */

import { rawClient } from "@/lib/prisma";
import { ENCRYPTED_FIELDS, fieldKey, sealField } from "@/lib/field-crypto";

declare global {
  var __budgetSealRan: boolean | undefined;
}

const BATCH = 500;

type Delegate = {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
  update(args: unknown): Promise<unknown>;
};

export async function sealExistingRows(): Promise<number> {
  const key = fieldKey();
  if (!key) return 0;
  const db = rawClient();
  let sealed = 0;
  try {
    for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
      const delegate = (db as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)];
      for (const field of fields) {
        for (;;) {
          const rows = await delegate.findMany({
            // NULLs drop out on their own: NOT (NULL LIKE …) is not true.
            where: { AND: [{ [field]: { not: "" } }, { NOT: { [field]: { startsWith: "enc:" } } }] },
            select: { id: true, [field]: true },
            take: BATCH,
          });
          if (!rows.length) break;
          for (const row of rows) {
            await delegate.update({ where: { id: row.id }, data: { [field]: sealField(String(row[field]), key) } });
          }
          sealed += rows.length;
        }
      }
    }
  } finally {
    await (db as unknown as { $disconnect(): Promise<void> }).$disconnect();
  }
  return sealed;
}

export function sealExistingOnce(): void {
  if (globalThis.__budgetSealRan) return;
  globalThis.__budgetSealRan = true;
  setTimeout(() => {
    sealExistingRows()
      .then((n) => {
        if (n) console.log(`Encryption: sealed ${n} existing values.`);
      })
      .catch((error) => console.error("Encryption: sealing existing rows failed:", error instanceof Error ? error.message : error));
  }, 5_000).unref?.();
}
