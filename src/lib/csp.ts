/**
 * The Content-Security-Policy for every page. Built per request with a fresh
 * nonce; Next stamps that nonce on every script it renders, and
 * 'strict-dynamic' lets those scripts load the app's own chunks. Nothing else
 * runs: no inline script without the nonce, no script from another origin.
 *
 * Kept in a plain module so it is unit-tested and shared with the proxy.
 */

export interface CspOptions {
  nonce: string;
  /** Development adds 'unsafe-eval' (React's error stacks) and ws: (hot reload). */
  dev?: boolean;
  /** Extra frame-ancestors, e.g. a dashboard that embeds the app. */
  frameAncestors?: string[];
}

export function buildCsp({ nonce, dev = false, frameAncestors = [] }: CspOptions): string {
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    // React style attributes cannot carry a nonce; inline styles cannot run code.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...(dev ? ["ws:"] : [])]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'self'", ...frameAncestors]],
    // No upgrade-insecure-requests: the LAN address is plain HTTP and that
    // directive would break every asset there.
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/** A nonce: 16 random bytes, base64. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** FRAME_ANCESTORS="https://a.example https://b.example" → a checked list. */
export function parseFrameAncestors(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,;]+/)
    .filter(Boolean)
    .filter((origin) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin));
}
