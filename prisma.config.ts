import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved the connection URL out of schema.prisma and into this file.
 *
 * `process.env.DATABASE_URL` is read directly rather than through Prisma's
 * `env()` helper, because `env()` throws when the variable is unset — which
 * would break `prisma generate` during the Docker build, where no database
 * exists yet. Generation does not need a connection; only the migrate commands
 * do, and those run at container start with the variable set.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
