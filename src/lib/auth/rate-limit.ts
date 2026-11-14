/**
 * A fixed-window limiter held in memory. One container serves the app, so
 * memory is the right place; it is bounded, so a flood of distinct keys
 * cannot grow it without limit (the oldest windows are dropped first).
 */

export interface Limiter {
  /** Records an attempt. False once the key is over its limit. */
  hit(key: string, now?: number): boolean;
  /** Forgets a key, e.g. after a successful sign-in. */
  reset(key: string): void;
  /** Seconds until the key may try again; 0 if it may now. */
  retryAfter(key: string, now?: number): number;
}

export function createLimiter({
  limit,
  windowMs,
  maxKeys = 5_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): Limiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    hit(key, now = Date.now()) {
      let entry = windows.get(key);
      if (!entry || now - entry.start >= windowMs) {
        windows.delete(key);
        entry = { start: now, count: 0 };
        windows.set(key, entry);
        while (windows.size > maxKeys) {
          const oldest = windows.keys().next().value;
          if (oldest === undefined) break;
          windows.delete(oldest);
        }
      }
      entry.count += 1;
      return entry.count <= limit;
    },
    reset(key) {
      windows.delete(key);
    },
    retryAfter(key, now = Date.now()) {
      const entry = windows.get(key);
      if (!entry || entry.count <= limit) return 0;
      return Math.max(0, Math.ceil((entry.start + windowMs - now) / 1000));
    },
  };
}
