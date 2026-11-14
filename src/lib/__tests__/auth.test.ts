import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../auth/password";
import { decodeSession, encodeSession } from "../auth/session-token";
import { safeNext } from "../auth/safe-next";
import { createLimiter } from "../auth/rate-limit";
import { clientIp } from "../auth/client-ip";
import { decide } from "../auth/gate";
import { normalizeUsername, passwordProblem, usernameProblem } from "../auth/rules";

describe("password hashing", () => {
  it("verifies the right password and refuses a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterz", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password here")).not.toBe(await hashPassword("same password here"));
  });

  it("refuses malformed stored values", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "plain-text")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$1$1$a$b")).toBe(false);
  });
});

describe("session token", () => {
  const secret = "s".repeat(43);
  const claims = { userId: "abc123", expiresAt: 2_000_000_000, credentialVersion: 3 };

  it("round-trips", () => {
    expect(decodeSession(encodeSession(claims, secret), secret, 1_000)).toEqual(claims);
  });

  it("refuses a tampered, foreign or expired token", () => {
    const token = encodeSession(claims, secret);
    expect(decodeSession(token.replace("abc123", "abc124"), secret, 1_000)).toBeNull();
    expect(decodeSession(token.replace(".3.", ".4."), secret, 1_000)).toBeNull();
    expect(decodeSession(token, "t".repeat(43), 1_000)).toBeNull();
    expect(decodeSession(token, secret, 2_000_000_001_000)).toBeNull();
    expect(decodeSession("a.b.c", secret)).toBeNull();
    expect(decodeSession(undefined, secret)).toBeNull();
  });
});

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/year/2026?x=1")).toBe("/year/2026?x=1");
  });

  it("refuses anything that leaves the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/\u0000x", "/a\\b", ""]) {
      expect(safeNext(bad)).toBe("/month");
    }
  });

  it("never returns to the sign-in pages", () => {
    expect(safeNext("/sign-in?next=/x")).toBe("/month");
    expect(safeNext("/setup-account")).toBe("/month");
  });
});

describe("rate limiter", () => {
  it("allows the limit, refuses the next, and opens again after the window", () => {
    const limiter = createLimiter({ limit: 2, windowMs: 1_000 });
    expect(limiter.hit("k", 0)).toBe(true);
    expect(limiter.hit("k", 10)).toBe(true);
    expect(limiter.hit("k", 20)).toBe(false);
    expect(limiter.retryAfter("k", 20)).toBe(1);
    expect(limiter.hit("k", 1_000)).toBe(true);
  });

  it("stays bounded", () => {
    const limiter = createLimiter({ limit: 1, windowMs: 1_000, maxKeys: 3 });
    for (const k of ["a", "b", "c", "d"]) limiter.hit(k, 0);
    // "a" was dropped to stay within three keys, so it starts fresh.
    expect(limiter.hit("a", 1)).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the configured header, then Cloudflare, then forwarded-for", () => {
    const h = new Headers({ "x-custom": "10.0.0.9", "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
    expect(clientIp(h, "x-custom")).toBe("10.0.0.9");
    expect(clientIp(h, undefined)).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }), undefined)).toBe("198.51.100.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "<script>" }), undefined)).toBe("unknown");
  });
});

describe("rules", () => {
  it("normalises and checks usernames", () => {
    expect(normalizeUsername("  Alex ")).toBe("alex");
    expect(usernameProblem("alex")).toBeNull();
    expect(usernameProblem("al")).not.toBeNull();
    expect(usernameProblem("al ex")).not.toBeNull();
  });

  it("checks password length", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("long enough pw")).toBeNull();
    expect(passwordProblem(undefined)).toBe("Required");
  });
});

describe("gate", () => {
  const page = (pathname: string, extra: Partial<Parameters<typeof decide>[0]> = {}) =>
    decide({ pathname, kind: "page", hasUsers: true, signedIn: false, ...extra });

  it("sends everything to account setup until the first user exists", () => {
    expect(page("/month", { hasUsers: false })).toEqual({ type: "redirect", to: "/setup-account" });
    expect(page("/setup-account", { hasUsers: false })).toEqual({ type: "allow" });
    expect(decide({ pathname: "/year/2026/csv", kind: "page", hasUsers: false, signedIn: false })).toEqual({
      type: "redirect",
      to: "/setup-account",
    });
  });

  it("closes account setup once a user exists", () => {
    expect(page("/setup-account")).toEqual({ type: "redirect", to: "/sign-in" });
  });

  it("sends a signed-out visitor to sign in, remembering where they were", () => {
    expect(page("/year/2026", { search: "?a=1" })).toEqual({
      type: "redirect",
      to: "/sign-in?next=%2Fyear%2F2026%3Fa%3D1",
    });
    expect(page("/")).toEqual({ type: "redirect", to: "/sign-in" });
  });

  it("refuses signed-out actions outright", () => {
    expect(decide({ pathname: "/month", kind: "action", hasUsers: true, signedIn: false })).toEqual({ type: "deny" });
  });

  it("hands every /api/v1 request to the route, which checks the device token", () => {
    expect(decide({ pathname: "/api/v1/accounts", kind: "api", hasUsers: true, signedIn: false })).toEqual({ type: "allow" });
    expect(decide({ pathname: "/api/v1/accounts", kind: "api", hasUsers: false, signedIn: false })).toEqual({ type: "allow" });
    // A look-alike path is not the API.
    expect(decide({ pathname: "/api/v1x/secret", kind: "api", hasUsers: true, signedIn: false })).toEqual({ type: "deny" });
  });

  it("keeps health and meta public", () => {
    expect(decide({ pathname: "/api/health", kind: "api", hasUsers: false, signedIn: false })).toEqual({ type: "allow" });
    expect(decide({ pathname: "/api/v1/meta", kind: "api", hasUsers: true, signedIn: false })).toEqual({ type: "allow" });
  });

  it("lets a signed-in user through and away from the sign-in page", () => {
    expect(page("/month", { signedIn: true })).toEqual({ type: "allow" });
    expect(page("/sign-in", { signedIn: true })).toEqual({ type: "redirect", to: "/month" });
  });
});
