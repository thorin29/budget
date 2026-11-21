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
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // Native Node modules the bundler must leave alone.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  // Nothing uses next/image, so its optimizer endpoint stays off: it has had
  // advisories and would otherwise answer without sign-in.
  images: { unoptimized: true },
  experimental: {
    // Pages fetched ahead (the Insights tabs) or just visited are reused in the browser for a short
    // while, so switching back and forth doesn't wait on the server. Any change made in the app
    // clears them at once; a bank sync shows within a minute.
    staleTimes: { dynamic: 30, static: 60 },
    serverActions: {
      // The importer sends a whole converted workbook (up to 5 MB) plus choices.
      bodySizeLimit: "6mb",
    },
  },
  // On every response, static files included. The CSP is per request, in proxy.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
