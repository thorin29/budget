/**
 * The "return to" path after signing in. Only a same-site path survives:
 * `/\evil.com`, `//evil.com`, `https://…` and anything with a control
 * character fall back to the home page. Kairos learned this one the hard way.
 */
export function safeNext(raw: unknown, fallback = "/month"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  // Never bounce back onto the sign-in pages themselves.
  if (/^\/(sign-in|setup-account|join)(\/|\?|$)/.test(raw)) return fallback;
  return raw;
}
