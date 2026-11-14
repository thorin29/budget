import { describe, expect, it } from "vitest";
import { buildCsp, makeNonce, parseFrameAncestors } from "../csp";

describe("buildCsp", () => {
  it("allows only nonce-stamped scripts in production", () => {
    const csp = buildCsp({ nonce: "abc" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("ws:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("adds eval and websockets only in development", () => {
    const csp = buildCsp({ nonce: "abc", dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws:");
  });

  it("widens framing only by the configured origins", () => {
    expect(buildCsp({ nonce: "n", frameAncestors: ["https://dash.example.com"] })).toContain(
      "frame-ancestors 'self' https://dash.example.com",
    );
  });
});

describe("makeNonce", () => {
  it("is fresh each time", () => {
    const a = makeNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(makeNonce()).not.toBe(a);
  });
});

describe("parseFrameAncestors", () => {
  it("keeps plain origins and drops anything that could break the header", () => {
    expect(parseFrameAncestors("https://a.example.com, http://b.example.com:8080")).toEqual([
      "https://a.example.com",
      "http://b.example.com:8080",
    ]);
    expect(parseFrameAncestors("'unsafe-inline' https://x.example.com; script-src *")).toEqual([
      "https://x.example.com",
    ]);
    expect(parseFrameAncestors(undefined)).toEqual([]);
  });
});
