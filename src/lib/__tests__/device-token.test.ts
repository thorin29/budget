import { describe, expect, it } from "vitest";
import {
  bearerFrom,
  cleanDeviceName,
  decodeLoginProof,
  encodeLoginProof,
  hashToken,
  newDeviceToken,
  newEnrollCode,
  normalizeEnrollCode,
} from "../auth/device-token";
import { encodeSession } from "../auth/session-token";

describe("device tokens", () => {
  it("are long, prefixed, unique, and stored only as a hash", () => {
    const a = newDeviceToken();
    expect(a.startsWith("bud_")).toBe(true);
    expect(a.length).toBeGreaterThan(40);
    expect(newDeviceToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a.slice(4));
  });

  it("are read only from a well-formed Bearer header", () => {
    const t = newDeviceToken();
    expect(bearerFrom(`Bearer ${t}`)).toBe(t);
    expect(bearerFrom(`bearer   ${t}`)).toBe(t);
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom(t)).toBeNull();
    expect(bearerFrom("Bearer not-ours")).toBeNull();
    expect(bearerFrom(`Basic ${t}`)).toBeNull();
  });
});

describe("enrol codes", () => {
  it("avoid look-alike characters and accept loose typing", () => {
    const code = newEnrollCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeEnrollCode(code.toLowerCase().replace("-", " "))).toBe(code);
    expect(normalizeEnrollCode("ABC")).toBe("");
    expect(normalizeEnrollCode(42)).toBe("");
  });
});

describe("login proofs", () => {
  const secret = "s".repeat(43);
  const proof = { userId: "u1", expiresAt: 2_000_000_000, credentialVersion: 2 };

  it("round-trip and expire", () => {
    const token = encodeLoginProof(proof, secret);
    expect(decodeLoginProof(token, secret, 1_000)).toEqual(proof);
    expect(decodeLoginProof(token, secret, 2_000_000_001_000)).toBeNull();
    expect(decodeLoginProof(token, "t".repeat(43), 1_000)).toBeNull();
    expect(decodeLoginProof(token.replace(".2.", ".3."), secret, 1_000)).toBeNull();
  });

  it("can't be swapped with a session cookie signed by the same secret", () => {
    const cookie = encodeSession({ userId: "u1", expiresAt: 2_000_000_000, credentialVersion: 2 }, secret);
    expect(decodeLoginProof(cookie, secret, 1_000)).toBeNull();
  });
});

describe("cleanDeviceName", () => {
  it("strips control characters and caps the length", () => {
    expect(cleanDeviceName("  Pixel\n9 ")).toBe("Pixel9");
    expect(cleanDeviceName("x".repeat(100))).toHaveLength(60);
    expect(cleanDeviceName(undefined)).toBe("Phone");
  });
});
