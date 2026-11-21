/**
 * A number that moves on every database write made by this server (bank syncs, edits, imports).
 * Figures worked out from the data (the month's plan, the month view) are kept until it moves, so
 * clicking between pages reuses them instead of reading two years of transactions again.
 */

const g = globalThis as unknown as { __dataVersion?: number };

export function dataVersion(): number {
  return g.__dataVersion ?? 0;
}

export function bumpDataVersion(): void {
  g.__dataVersion = (g.__dataVersion ?? 0) + 1;
}

const WRITES = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
export const isWrite = (operation: string) => WRITES.has(operation);

/**
 * Keeps a result until the data changes, the day changes, or ten minutes pass (in case something
 * outside this server wrote to the database). A failed result isn't kept.
 */
export function keepUntilChanged<A extends unknown[], R>(name: string, work: (...args: A) => Promise<R>, day: () => string, max = 12): (...args: A) => Promise<R> {
  const store = new Map<string, { at: number; value: Promise<R> }>();
  return (...args: A) => {
    const key = `${name}|${JSON.stringify(args)}|${dataVersion()}|${day()}`;
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < 600_000) return hit.value;
    const value = work(...args);
    store.set(key, { at: Date.now(), value });
    value.catch(() => store.delete(key));
    while (store.size > max) store.delete(store.keys().next().value as string);
    return value;
  };
}

/** Today where the household is (the server's TZ), YYYY-MM-DD. */
export const localDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC" }).format(new Date());
