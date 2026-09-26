import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

/**
 * The version is read from package.json at build time and exposed to both the
 * server and the browser, so the number shown in the interface is always the
 * one that was built — there is no second place to remember to update.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
