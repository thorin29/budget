import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { fieldKey, filtersEncrypted, openDeep, sealArgs } from "./field-crypto";

/**
 * Prisma 7 requires a driver adapter; the client no longer opens connections
 * itself. Pooling behaviour now comes from `pg`, not from Prisma's defaults.
 *
 * The client is created lazily, on first use. Next evaluates every route module
 * while collecting page data during the build, where no database exists — so
 * constructing at module load would fail the build rather than at runtime where
 * a missing DATABASE_URL actually matters.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // node-postgres has no connection timeout by default: a database that stops
  // answering would hang every request instead of failing.
  const adapter = new PrismaPg({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
  return withFieldEncryption(base);
}

/**
 * Identifying text is encrypted on the way in and decrypted on the way out
 * (src/lib/field-crypto.ts). Without a key, values are stored as given, which
 * is the state before encryption existed; Settings → About says so.
 */
function withFieldEncryption(base: PrismaClient): PrismaClient {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const key = fieldKey();
          const blocked = filtersEncrypted(model, (args as { where?: unknown } | undefined)?.where);
          if (blocked) throw new Error(`${model}.${blocked} is encrypted and can't be filtered in the database`);
          const sealed = key ? sealArgs(model, operation, args, key) : args;
          const result = await query(sealed as typeof args);
          return openDeep(result, key);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/** The client without encryption, for the one-time job that seals rows written before it existed. */
export function rawClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2, connectionTimeoutMillis: 5_000 }) });
}

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const instance = client();
    const value = Reflect.get(instance, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
