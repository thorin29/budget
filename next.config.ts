import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * The version is read from package.json at build time and exposed to both the
 * server and the browser, so the number shown in the interface is always the
 * one that was built — there is no second place to remember to update.
 *
 * Read from disk rather than imported, so it does not depend on how the config
 * file is transpiled or whether import attributes are supported.
 */
const pkg = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { version: string };

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
