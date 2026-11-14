#!/usr/bin/env node
/**
 * Type check against the real generated Prisma client, without Docker.
 *
 * `prisma generate` wants to download a schema engine it does not actually
 * need for generating the client. Where downloads are blocked (a sandbox, a
 * locked-down CI), a stub engine that exits 0 lets generation finish, so the
 * type check sees real model types instead of `any`.
 *
 *   npm run preflight
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "budget-preflight-"));
const stub = join(dir, "schema-engine");
writeFileSync(stub, "#!/bin/sh\nexit 0\n");
chmodSync(stub, 0o755);

const env = {
  ...process.env,
  PRISMA_SCHEMA_ENGINE_BINARY: process.env.PRISMA_SCHEMA_ENGINE_BINARY ?? stub,
  PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: "1",
  // Generation never connects; the config only needs a well-formed URL.
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://preflight:preflight@localhost:5432/preflight",
};

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    process.exit(result.status ?? 1);
  }
}

run("npx", ["prisma", "generate"]);
run("npx", ["tsc", "--noEmit"]);
rmSync(dir, { recursive: true, force: true });
console.log("\nPreflight passed.");
